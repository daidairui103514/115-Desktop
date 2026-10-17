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

export function LoginPage({ onLoggedIn, onPreview }: LoginPageProps) {
  const [qr, setQr] = useState<QrInfo | null>(null);
  const [status, setStatus] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const desktop = isTauri();

  const start = useCallback(async () => {
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
    void start();
  }, [start]);

  useEffect(() => {
    if (!qr || !desktop) return;

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
  }, [qr, desktop, onLoggedIn]);

  return (
    <div className="login">
      <div className="login__bar" data-tauri-drag-region>
        <TrafficLights maximizable={false} />
        <span className="login__bar-title">115 Desktop</span>
      </div>

      <div className="login__body">
        <div className="login__card">
          <div className="login__logo">
            <svg viewBox="0 0 1024 1024" width="52" height="52" aria-hidden="true">
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
                <button type="button" className="login__qr-btn" onClick={() => void start()}>
                  重新获取
                </button>
              </div>
            ) : null}
          </div>

          <div className={`login__status${error ? " login__status--error" : ""}`}>
            {error || STATUS_TEXT[String(status)] || "等待扫码"}
          </div>

          <button type="button" className="login__refresh" onClick={() => void start()} disabled={!desktop}>
            {desktop ? "刷新二维码" : "请在桌面应用中登录"}
          </button>

          {!desktop && onPreview ? (
            <button type="button" className="login__preview" onClick={onPreview}>
              以预览模式查看界面
            </button>
          ) : null}
        </div>

        <p className="login__foot">登录凭证只保存在本机 data 目录，不会上传到任何服务器</p>
      </div>
    </div>
  );
}
