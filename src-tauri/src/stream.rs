//! 本地流代理。
//!
//! 115 的下载直链与**申请直链时使用的 User-Agent** 绑定。
//! `<video>` / 播放器自己发起的请求 UA 一定对不上，会 403。
//! 所以在 127.0.0.1 起一个极简 HTTP 服务：
//!   GET /s/<pick_code>.<ext>
//! 由它带着正确的 UA 去拿直链并转发字节，同时透传 Range，
//! 这样浏览器内嵌播放和外部播放器都能正常拖动进度条。

use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::Duration;

use tiny_http::{Header, Response, Server, StatusCode};

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
            let path = raw_url.split('?').next().unwrap_or(&raw_url);

            let result = if let Some(rest) = path.strip_prefix("/s/") {
                // 去掉扩展名，只留 pick_code
                let pc = rest.rsplit_once('.').map(|(head, _)| head).unwrap_or(rest);
                proxy(&request, &data_dir, pc)
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

fn proxy(
    request: &tiny_http::Request,
    data_dir: &Path,
    pc: &str,
) -> Result<Response<Box<dyn Read + Send>>, String> {
    let token = read_token(data_dir).ok_or("未登录：缺少访问令牌")?;

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?;

    // 1. 取直链
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
        .and_then(|u| {
            u.get("url")
                .and_then(|x| x.as_str())
                .or_else(|| u.as_str())
        })
        .unwrap_or("")
        .to_string();

    if direct.is_empty() {
        return Err("没有拿到直链".into());
    }

    // 2. 带 UA + Range 转发
    let mut upstream_request = client
        .get(&direct)
        .header(reqwest::header::USER_AGENT, UA);

    if let Some(range) = header_value(request, "range") {
        upstream_request = upstream_request.header(reqwest::header::RANGE, range);
    }

    let upstream = upstream_request
        .send()
        .map_err(|e| format!("转发失败: {e}"))?;

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

    Ok(Response::new(
        StatusCode(status),
        headers,
        Box::new(upstream) as Box<dyn Read + Send>,
        length,
        None,
    ))
}

#[tauri::command]
pub fn stream_base() -> String {
    base_url()
}
