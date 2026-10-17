//! 115 开放平台文件上传。
//!
//! 流程与 OpenList 的 115_open 驱动一致：
//! 1. 计算整文件 SHA1 与前 128KB 的 SHA1
//! 2. `/open/upload/init` —— status=2 表示秒传成功
//! 3. `/open/upload/get_token` —— 拿阿里云 OSS 的 STS 临时凭证
//! 4. 带 OSS V1 签名 PUT 到 bucket，并附带 callback 参数让 115 落库

use std::path::Path;
use std::time::SystemTime;

use base64::Engine;
use hmac::{Hmac, Mac};
use serde::Serialize;
use serde_json::Value;
use sha1::{Digest, Sha1};

use crate::api115::{api_get, api_post, client, net_err, AppState};

type HmacSha1 = Hmac<Sha1>;

#[derive(Serialize)]
pub struct UploadResult {
    pub file_name: String,
    pub size_text: String,
    /// true 表示命中秒传，没有真正上传字节
    pub instant: bool,
}

const PRE_HASH: usize = 128 * 1024;
const MAX_SIZE: u64 = 512 * 1024 * 1024;

fn b64(data: &str) -> String {
    base64::engine::general_purpose::STANDARD.encode(data.as_bytes())
}

fn sha1_hex(data: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

fn sign_v1(secret: &str, string_to_sign: &str) -> String {
    let mut mac = match HmacSha1::new_from_slice(secret.as_bytes()) {
        Ok(mac) => mac,
        Err(_) => return String::new(),
    };
    mac.update(string_to_sign.as_bytes());
    base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes())
}

fn human_size(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    if bytes == 0 {
        return "0 B".into();
    }
    let mut value = bytes as f64;
    let mut idx = 0;
    while value >= 1024.0 && idx < UNITS.len() - 1 {
        value /= 1024.0;
        idx += 1;
    }
    if idx == 0 || value >= 100.0 {
        format!("{value:.0} {}", UNITS[idx])
    } else {
        format!("{value:.1} {}", UNITS[idx])
    }
}

fn pick_str(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

#[tauri::command]
pub async fn upload_file(
    path: String,
    cid: String,
    state: tauri::State<'_, AppState>,
) -> Result<UploadResult, String> {
    let file_path = Path::new(&path);
    let meta = tokio::fs::metadata(file_path)
        .await
        .map_err(|e| format!("读取文件失败: {e}"))?;

    if !meta.is_file() {
        return Err("只能上传文件，不支持整个文件夹".into());
    }
    let size = meta.len();
    if size == 0 {
        return Err("空文件无法上传".into());
    }
    if size > MAX_SIZE {
        return Err(format!(
            "当前版本支持 512 MB 以内的文件，这个文件有 {}",
            human_size(size)
        ));
    }

    let name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("文件名不合法")?
        .to_string();

    let content = tokio::fs::read(file_path)
        .await
        .map_err(|e| format!("读取文件内容失败: {e}"))?;

    let full_sha1 = sha1_hex(&content).to_uppercase();
    let pre_len = content.len().min(PRE_HASH);
    let pre_sha1 = sha1_hex(&content[..pre_len]).to_uppercase();

    // 1. 初始化上传任务
    let init = api_post(
        &state,
        "/open/upload/init",
        vec![
            ("file_name", name.clone()),
            ("file_size", size.to_string()),
            ("target", cid),
            ("fileid", full_sha1),
            ("preid", pre_sha1),
        ],
    )
    .await?;

    let status = init.get("status").and_then(Value::as_i64).unwrap_or(0);
    if status == 2 {
        return Ok(UploadResult {
            file_name: name,
            size_text: human_size(size),
            instant: true,
        });
    }
    if matches!(status, 6 | 7 | 8) {
        return Err("这个文件需要二次校验，当前版本暂不支持，请改用网页版上传".into());
    }

    let bucket = pick_str(&init, "bucket");
    let object = pick_str(&init, "object");
    if bucket.is_empty() || object.is_empty() {
        return Err("上传初始化没有返回 bucket / object".into());
    }

    // 2. OSS 临时凭证
    let token = api_get(&state, "/open/upload/get_token", vec![]).await?;
    let endpoint = pick_str(&token, "endpoint");
    let access_key_id = pick_str(&token, "AccessKeyId");
    let access_key_secret = pick_str(&token, "AccessKeySecret");
    let security_token = pick_str(&token, "SecurityToken");

    if endpoint.is_empty() || access_key_id.is_empty() {
        return Err("没有拿到 OSS 上传凭证".into());
    }

    // 3. callback 让 115 在收到文件后落库
    let callback_value = init.get("callback");
    let (cb_body, cb_var) = match callback_value {
        Some(Value::Array(items)) => match items.first() {
            Some(first) => (pick_str(first, "callback"), pick_str(first, "callback_var")),
            None => (String::new(), String::new()),
        },
        Some(obj @ Value::Object(_)) => (pick_str(obj, "callback"), pick_str(obj, "callback_var")),
        _ => (String::new(), String::new()),
    };

    let cb_b64 = b64(&cb_body);
    let cbv_b64 = b64(&cb_var);

    // 4. OSS V1 签名
    let date = httpdate::fmt_http_date(SystemTime::now());
    let canonical_headers = format!(
        "x-oss-callback:{cb_b64}\nx-oss-callback-var:{cbv_b64}\nx-oss-security-token:{security_token}\n"
    );
    let resource = format!("/{bucket}/{object}");
    let string_to_sign = format!(
        "PUT\n\napplication/octet-stream\n{date}\n{canonical_headers}{resource}"
    );
    let signature = sign_v1(&access_key_secret, &string_to_sign);

    let host = endpoint
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/');
    let object_path = object.trim_start_matches('/');
    let url = format!("https://{bucket}.{host}/{object_path}");

    // 5. 上传
    let http = client()?;
    let mut request = http
        .put(&url)
        .header(reqwest::header::DATE, date)
        .header(reqwest::header::CONTENT_TYPE, "application/octet-stream")
        .header("x-oss-security-token", security_token.as_str())
        .header(
            reqwest::header::AUTHORIZATION,
            format!("OSS {access_key_id}:{signature}"),
        );

    if !cb_b64.is_empty() {
        request = request.header("x-oss-callback", cb_b64.as_str());
    }
    if !cbv_b64.is_empty() {
        request = request.header("x-oss-callback-var", cbv_b64.as_str());
    }

    let resp = request
        .body(content)
        .send()
        .await
        .map_err(|e| net_err("上传失败", e))?;

    let status_code = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if !status_code.is_success() {
        return Err(format!("OSS 上传失败 HTTP {status_code}：{text}"));
    }

    // callback 的响应体是 115 的落库结果，失败时会带 message
    if text.contains("\"state\":false") || text.contains("\"state\": false") {
        return Err(format!("115 落库失败：{text}"));
    }

    Ok(UploadResult {
        file_name: name,
        size_text: human_size(size),
        instant: false,
    })
}
