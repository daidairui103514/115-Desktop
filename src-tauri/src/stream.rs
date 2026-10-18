//! 本地流代理。
//!
//! 115 的下载直链与**申请直链时使用的 User-Agent** 绑定，
//! `<video>` / 播放器自己发起的请求 UA 一定对不上，会 403。
//! 所以在 127.0.0.1 起一个极简 HTTP 服务，把这个 UA 补上：
//!
//! * `GET /s/<pick_code>.<ext>`  取直链并转发（支持 Range，可拖进度条）
//! * `GET /hls?u=<m3u8 地址>`    取 HLS 清单，并把清单里的切片地址重写成 /fwd
//! * `GET /fwd?u=<资源地址>`     原样转发任意资源（切片、密钥、字幕）
//!
//! 这样 hls.js 与 IDM 都能走本地地址，命中真实直链。

use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::Duration;

use tiny_http::{Header, Response, Server, StatusCode};
use url::Url;

use crate::api115::TokenSet;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                  (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const PROAPI: &str = "https://proapi.115.com";

static PORT: AtomicU16 = AtomicU16::new(0);

pub fn base_url() -> String {
    let port = PORT.load(Ordering::Relaxed);
    if port == 0 {
        String::new()
    } else {
        format!("http://127.0.0.1:{port}")
    }
}

pub fn start(data_dir: PathBuf) {
    std::thread::spawn(move || {
        let server = match Server::http("127.0.0.1:0") {
            Ok(server) => server,
            Err(_) => return,
        };

        let port = match server.server_addr().to_ip() {
            Some(addr) => addr.port(),
            None => return,
        };
        PORT.store(port, Ordering::Relaxed);

        for request in server.incoming_requests() {
            let raw_url = request.url().to_string();
            let (path, query) = match raw_url.split_once('?') {
                Some((p, q)) => (p.to_string(), q.to_string()),
                None => (raw_url.clone(), String::new()),
            };

            let target = parse_query(&query, "u");

            let result = if let Some(rest) = path.strip_prefix("/s/") {
                let pc = rest.rsplit_once('.').map(|(head, _)| head).unwrap_or(rest);
                proxy_direct(&request, &data_dir, pc)
            } else if path.starts_with("/hls") {
                match target {
                    Some(url) => hls_manifest(&url),
                    None => Err("缺少 u 参数".to_string()),
                }
            } else if path.starts_with("/fwd") {
                match target {
                    Some(url) => forward(&request, &url),
                    None => Err("缺少 u 参数".to_string()),
                }
            } else {
                Err("not found".to_string())
            };

            match result {
                Ok(response) => {
                    let _ = request.respond(response);
                }
                Err(message) => {
                    let _ = request.respond(text_response(&message, 502));
                }
            }
        }
    });
}

fn parse_query(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == key {
                return urlencoding::decode(v).ok().map(|s| s.into_owned());
            }
        }
    }
    None
}

fn text_response(message: &str, code: u16) -> Response<Box<dyn Read + Send>> {
    let body = message.as_bytes().to_vec();
    let len = body.len();
    Response::new(
        StatusCode(code),
        vec![Header::from_bytes(&b"Content-Type"[..], &b"text/plain; charset=utf-8"[..]).unwrap()],
        Box::new(std::io::Cursor::new(body)) as Box<dyn Read + Send>,
        Some(len),
        None,
    )
}

fn read_token(data_dir: &Path) -> Option<String> {
    let text = std::fs::read_to_string(data_dir.join("session.json")).ok()?;
    let tokens: TokenSet = serde_json::from_str(&text).ok()?;
    if tokens.access_token.is_empty() {
        None
    } else {
        Some(tokens.access_token)
    }
}

fn header_value(request: &tiny_http::Request, name: &str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|h| format!("{}", h.field).eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str().to_string())
}

fn blocking_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())
}

/// 把上游响应包成 tiny_http 的响应，透传关键头
fn wrap_upstream(upstream: reqwest::blocking::Response) -> Response<Box<dyn Read + Send>> {
    let status = upstream.status().as_u16();

    let mut headers: Vec<Header> = Vec::new();
    for key in [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "etag",
        "last-modified",
    ] {
        if let Some(value) = upstream.headers().get(key) {
            if let Ok(text) = value.to_str() {
                if let Ok(header) = Header::from_bytes(key.as_bytes(), text.as_bytes()) {
                    headers.push(header);
                }
            }
        }
    }
    if !headers
        .iter()
        .any(|h| format!("{}", h.field).eq_ignore_ascii_case("accept-ranges"))
    {
        if let Ok(header) = Header::from_bytes(&b"Accept-Ranges"[..], &b"bytes"[..]) {
            headers.push(header);
        }
    }

    let length = upstream.content_length().map(|value| value as usize);

    Response::new(
        StatusCode(status),
        headers,
        Box::new(upstream) as Box<dyn Read + Send>,
        length,
        None,
    )
}

/// /s/<pick_code> —— 取直链后转发
fn proxy_direct(
    request: &tiny_http::Request,
    data_dir: &Path,
    pc: &str,
) -> Result<Response<Box<dyn Read + Send>>, String> {
    let token = read_token(data_dir).ok_or("未登录：缺少访问令牌")?;
    let client = blocking_client()?;

    let body: serde_json::Value = client
        .post(format!("{PROAPI}/open/ufile/downurl"))
        .form(&[("pick_code", pc)])
        .header(reqwest::header::AUTHORIZATION, format!("Bearer {token}"))
        .send()
        .map_err(|e| format!("获取直链失败: {e}"))?
        .json()
        .map_err(|e| format!("解析直链响应失败: {e}"))?;

    let direct = body
        .get("data")
        .and_then(|d| d.as_object())
        .and_then(|m| m.values().next())
        .and_then(|v| v.get("url"))
        .and_then(|u| u.get("url").and_then(|x| x.as_str()).or_else(|| u.as_str()))
        .unwrap_or("")
        .to_string();

    if direct.is_empty() {
        return Err("没有拿到直链".into());
    }

    let mut upstream_request = client.get(&direct).header(reqwest::header::USER_AGENT, UA);

    if let Some(range) = header_value(request, "range") {
        upstream_request = upstream_request.header(reqwest::header::RANGE, range);
    }

    let upstream = upstream_request
        .send()
        .map_err(|e| format!("转发失败: {e}"))?;

    Ok(wrap_upstream(upstream))
}

/// /fwd?u= —— 原样转发资源（HLS 切片、密钥等）
fn forward(
    request: &tiny_http::Request,
    raw_url: &str,
) -> Result<Response<Box<dyn Read + Send>>, String> {
    let client = blocking_client()?;
    let mut upstream_request = client
        .get(raw_url)
        .header(reqwest::header::USER_AGENT, UA)
        .header(reqwest::header::REFERER, "https://115.com/");

    if let Some(range) = header_value(request, "range") {
        upstream_request = upstream_request.header(reqwest::header::RANGE, range);
    }

    let upstream = upstream_request
        .send()
        .map_err(|e| format!("转发失败: {e}"))?;

    Ok(wrap_upstream(upstream))
}

/// /hls?u= —— 取 m3u8 并把里面的地址改写成走 /fwd
fn hls_manifest(raw_url: &str) -> Result<Response<Box<dyn Read + Send>>, String> {
    let client = blocking_client()?;
    let text = client
        .get(raw_url)
        .header(reqwest::header::USER_AGENT, UA)
        .header(reqwest::header::REFERER, "https://115.com/")
        .send()
        .map_err(|e| format!("获取清单失败: {e}"))?
        .text()
        .map_err(|e| format!("读取清单失败: {e}"))?;

    let base = Url::parse(raw_url).map_err(|e| format!("清单地址无效: {e}"))?;

    let mut out = String::with_capacity(text.len() + 256);
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            out.push('\n');
            continue;
        }
        if trimmed.starts_with('#') {
            out.push_str(&rewrite_tag(trimmed, &base));
            out.push('\n');
        } else {
            let absolute = base.join(trimmed).unwrap_or_else(|_| base.clone());
            out.push_str(&format!("/fwd?u={}", urlencoding::encode(absolute.as_str())));
            out.push('\n');
        }
    }

    let body = out.into_bytes();
    let len = body.len();
    Ok(Response::new(
        StatusCode(200),
        vec![Header::from_bytes(
            &b"Content-Type"[..],
            &b"application/vnd.apple.mpegurl"[..],
        )
        .unwrap()],
        Box::new(std::io::Cursor::new(body)) as Box<dyn Read + Send>,
        Some(len),
        None,
    ))
}

/// 处理 #EXT-X-KEY:URI="..." / #EXT-X-MAP:URI="..." / #EXT-X-MEDIA:URI="..."
fn rewrite_tag(line: &str, base: &Url) -> String {
    let Some(start) = line.find("URI=\"") else {
        return line.to_string();
    };
    let rest = &line[start + 5..];
    let Some(end) = rest.find('"') else {
        return line.to_string();
    };

    let uri = &rest[..end];
    let absolute = base.join(uri).unwrap_or_else(|_| base.clone());

    let mut result = String::from(&line[..start]);
    result.push_str(&format!(
        "URI=\"/fwd?u={}\"",
        urlencoding::encode(absolute.as_str())
    ));
    result.push_str(&rest[end + 1..]);
    result
}

#[tauri::command]
pub fn stream_base() -> String {
    base_url()
}
