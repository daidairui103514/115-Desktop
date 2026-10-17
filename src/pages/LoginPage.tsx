import { useCallback, useEffect, useState } from "react";
import { TrafficLights } from "@/components/TrafficLights";
import { call, isTauri } from "@/lib/bridge";
import type { AuthStatus, PollResult, QrInfo, UserProfile } from "@/lib/types";

interface LoginPageProps {
  onLoggedIn: (user: UserProfile | null) => void;
  /** 浏览器预览时跳过登录，用示例数据查看界面 */
  onPreview?: () => void;
}

const STATUS_TEXT: Record<string, string> = {
  "0": "等待扫码",
  "1": "已扫码，请在手机上确认",
  "2": "登录成功",
  "-1": "二维码已过期",
};

type Tab = "token" | "qr";

export function LoginPage({ onLoggedIn, onPreview }: LoginPageProps) {
  const desktop = isTauri();
  const [tab, setTab] = useState<Tab>("token");

  // 令牌登录
  const [access, setAccess] = useState("");
  const [refresh, setRefresh] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 扫码登录
  const [qr, setQr] = useState<QrInfo | null>(null);
  const [status, setStatus] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const startQr = useCallback(async () => {
    if (!desktop) return;
    setLoading(true);
    setError("");
    setStatus(0);
    try {
      const info = await call<QrInfo>("qr_start");
      setQr(info);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [desktop]);

  useEffect(() => {
    if (tab === "qr" && !qr) void startQr();
  }, [tab, qr, startQr]);

  useEffect(() => {
    if (tab !== "qr" || !qr || !desktop) return;

    let cancelled = false;
    let timer = 0;

    const tick = async () => {
      try {
        const result = await call<PollResult>("qr_poll", {
          uid: qr.uid,
          time: qr.time,
          sign: qr.sign,
        });
        if (cancelled) return;

        setStatus(result.status);

        if (result.logged_in) {
          const auth = await call<AuthStatus>("auth_status");
          if (!cancelled) onLoggedIn(auth.user ?? null);
          return;
        }
        if (result.status === -1) return;
      } catch (err) {
        if (!cancelled) setError(String(err));
      }

      if (!cancelled) timer = window.setTimeout(tick, 2000);
    };

    timer = window.setTimeout(tick, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tab, qr, desktop, onLoggedIn]);

  const submitToken = async () => {
    if (!access.trim()) {
      setError("请先填写 access_token");
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

          <div className="login__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "token"}
              className={`login__tab${tab === "token" ? " login__tab--active" : ""}`}
              onClick={() => {
                setTab("token");
                setError("");
              }}
            >
              令牌登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "qr"}
              className={`login__tab${tab === "qr" ? " login__tab--active" : ""}`}
              onClick={() => {
                setTab("qr");
                setError("");
              }}
            >
              扫码登录
            </button>
          </div>

          {tab === "token" ? (
            <div className="login__form">
              <label className="login__field">
                <span className="login__field-label">access_token</span>
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
                  refresh_token <em>选填，但过期后靠它自动续期</em>
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
                onClick={() => void submitToken()}
                disabled={submitting || !access.trim()}
              >
                {submitting ? "正在验证…" : "登录"}
              </button>

              <p className="login__hint">
                令牌来自 115 开放平台授权。OpenList 用户可从「115 Open」存储的配置里复制，
                通常成对出现。
              </p>
            </div>
          ) : (
            <div className="login__qr-wrap">
              <p className="login__desc">打开 115 App，扫描二维码</p>

              <div className="login__qr">
                {qr ? (
                  <img src={qr.image} alt="115 登录二维码" width={196} height={196} />
                ) : (
                  <div className="login__qr-empty">
                    {desktop ? (loading ? "正在获取二维码…" : "二维码加载失败") : "桌面应用中显示二维码"}
                  </div>
                )}

                {status === 1 ? (
                  <div className="login__qr-mask">
                    <span className="login__qr-mask-main">已扫码</span>
                    <span className="login__qr-mask-sub">请在手机上确认登录</span>
                  </div>
                ) : null}

                {status === -1 ? (
                  <div className="login__qr-mask">
                    <span className="login__qr-mask-sub">二维码已过期</span>
                    <button type="button" className="login__qr-btn" onClick={() => void startQr()}>
                      重新获取
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="login__refresh"
                onClick={() => void startQr()}
                disabled={!desktop}
              >
                {desktop ? "刷新二维码" : "请在桌面应用中登录"}
              </button>
            </div>
          )}

          {error ? <div className="login__status login__status--error">{error}</div> : null}
          {tab === "qr" && !error ? (
            <div className="login__status">{STATUS_TEXT[String(status)] || "等待扫码"}</div>
          ) : null}

          {!desktop && onPreview ? (
            <button type="button" className="login__preview" onClick={onPreview}>
              以预览模式查看界面
            </button>
          ) : null}
        </div>

        <p className="login__foot">令牌与 Cookie 只保存在本机 data 目录，不会上传到任何第三方</p>
      </div>
    </div>
  );
}
