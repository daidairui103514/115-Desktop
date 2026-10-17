import { useState } from "react";
import { TrafficLights } from "@/components/TrafficLights";
import { call, isTauri } from "@/lib/bridge";
import type { UserProfile } from "@/lib/types";

interface LoginPageProps {
  onLoggedIn: (user: UserProfile | null) => void;
  /** 浏览器预览时跳过登录，用示例数据查看界面 */
  onPreview?: () => void;
}

export function LoginPage({ onLoggedIn, onPreview }: LoginPageProps) {
  const desktop = isTauri();

  const [access, setAccess] = useState("");
  const [refresh, setRefresh] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!access.trim()) {
      setError("请先填写访问令牌");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const profile = await call<UserProfile>("login_with_token", {
        access: access.trim(),
        refresh: refresh.trim(),
      });
      onLoggedIn(profile);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login">
      <div className="login__bar" data-tauri-drag-region>
        <TrafficLights maximizable={false} />
        <span className="login__bar-title">115 Desktop</span>
      </div>

      <div className="login__body">
        <div className="login__card">
          <div className="login__logo">
            <svg viewBox="0 0 1024 1024" width="48" height="48" aria-hidden="true">
              <defs>
                <linearGradient id="login-logo" x1="0.1" y1="0" x2="0.3" y2="1">
                  <stop offset="0" stopColor="#4AA3FF" />
                  <stop offset="0.55" stopColor="#1F7BE8" />
                  <stop offset="1" stopColor="#0E4FB8" />
                </linearGradient>
              </defs>
              <rect width="1024" height="1024" rx="228" fill="url(#login-logo)" />
              <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
                <path d="M512 262v296" strokeWidth="70" />
                <path d="M386 456l126 126 126-126" strokeWidth="70" />
                <path d="M300 632v70a54 54 0 0 0 54 54h316a54 54 0 0 0 54-54v-70" strokeWidth="70" />
              </g>
            </svg>
          </div>

          <h1 className="login__title">登录 115</h1>
          <p className="login__desc">填写开放平台令牌，直接连接你的网盘</p>

          <div className="login__form">
            <label className="login__field">
              <span className="login__field-label">
                访问令牌 <em>access_token</em>
              </span>
              <textarea
                className="login__textarea"
                rows={3}
                spellCheck={false}
                value={access}
                onChange={(event) => setAccess(event.target.value)}
                placeholder="粘贴 access_token"
              />
            </label>

            <label className="login__field">
              <span className="login__field-label">
                刷新令牌 <em>refresh_token，选填；填了才能在 2 小时后自动续期</em>
              </span>
              <textarea
                className="login__textarea"
                rows={2}
                spellCheck={false}
                value={refresh}
                onChange={(event) => setRefresh(event.target.value)}
                placeholder="粘贴 refresh_token"
              />
            </label>

            <button
              type="button"
              className="login__submit"
              onClick={() => void submit()}
              disabled={submitting || !access.trim()}
            >
              {submitting ? "正在验证…" : "登录"}
            </button>

            <p className="login__hint">
              令牌来自 115 开放平台授权。OpenList 用户可从「115 Open」存储的配置里复制，
              两项通常在同一个 JSON 中。
            </p>
          </div>

          {error ? <div className="login__error">{error}</div> : null}

          {!desktop && onPreview ? (
            <button type="button" className="login__preview" onClick={onPreview}>
              以预览模式查看界面
            </button>
          ) : null}
        </div>

        <p className="login__foot">令牌只保存在本机 data 目录，不会上传到任何第三方</p>
      </div>
    </div>
  );
}
