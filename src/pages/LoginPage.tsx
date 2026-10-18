import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { TrafficLights } from "@/components/TrafficLights";
import { call, isTauri } from "@/lib/bridge";
import type { AuthStatus, UserProfile } from "@/lib/types";

interface LoginPageProps {
  onLoggedIn: (user: UserProfile | null) => void;
  onPreview?: () => void;
}

interface DeviceCode {
  uid: string;
  time: number;
  sign: string;
  content: string;
}

interface LoginPoll {
  status: number;
  message: string;
  logged_in: boolean;
}

type Tab = "qr" | "token";

const STATUS_TEXT: Record<string, string> = {
  "0": "等待扫码",
  "1": "已扫码，请在手机上确认",
  "2": "登录成功",
  "-1": "二维码已过期",
};

export function LoginPage({ onLoggedIn, onPreview }: LoginPageProps) {
  const desktop = isTauri();
  const [tab, setTab] = useState<Tab>("qr");

  // 扫码
  const [qrImage, setQrImage] = useState("");
  const [device, setDevice] = useState<DeviceCode | null>(null);
  const [status, setStatus] = useState(0);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState("");

  // 令牌
  const [access, setAccess] = useState("");
  const [refresh, setRefresh] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tokenError, setTokenError] = useState("");

  const polling = useRef(false);

  const startQr = useCallback(async () => {
    if (!desktop) return;
    setQrLoading(true);
    setQrError("");
    setStatus(0);
    setQrImage("");
    setDevice(null);

    try {
      const info = await call<DeviceCode>("device_login_start");
      setDevice(info);

      if (info.content) {
        const image = await QRCode.toDataURL(info.content, { width: 220, margin: 1 });
        setQrImage(image);
      } else {
        setQrError("115 没有返回二维码内容，可能是 AppID 无效或权限不足");
      }
    } catch (err) {
      setQrError(String(err));
    } finally {
      setQrLoading(false);
    }
  }, [desktop]);

  useEffect(() => {
    if (tab === "qr" && !device && desktop) void startQr();
  }, [tab, device, desktop, startQr]);

  useEffect(() => {
    if (!device || !desktop) return;
    polling.current = true;

    let timer = 0;
    const tick = async () => {
      if (!polling.current) return;
      try {
        const result = await call<LoginPoll>("device_login_poll", {
          uid: device.uid,
          time: device.time,
          sign: device.sign,
        });
        if (!polling.current) return;

        setStatus(result.status);

        if (result.logged_in) {
          polling.current = false;
          const auth = await call<AuthStatus>("auth_status");
          onLoggedIn(auth.user ?? null);
          return;
        }
        if (result.status === -1) {
          polling.current = false;
          return;
        }
      } catch (err) {
        setQrError(String(err));
        polling.current = false;
        return;
      }
      timer = window.setTimeout(tick, 2000);
    };

    timer = window.setTimeout(tick, 1800);
    return () => {
      polling.current = false;
      window.clearTimeout(timer);
    };
  }, [device, desktop, onLoggedIn]);

  const submitToken = async () => {
    if (!access.trim()) {
      setTokenError("请先填写访问令牌");
      return;
    }
    setSubmitting(true);
    setTokenError("");
    try {
      const profile = await call<UserProfile>("login_with_token", {
        access: access.trim(),
        refresh: refresh.trim(),
      });
      onLoggedIn(profile);
    } catch (err) {
      setTokenError(String(err));
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
            <svg viewBox="0 0 1024 1024" width="46" height="46" aria-hidden="true">
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
              aria-selected={tab === "qr"}
              className={`login__tab${tab === "qr" ? " login__tab--active" : ""}`}
              onClick={() => setTab("qr")}
            >
              扫码登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "token"}
              className={`login__tab${tab === "token" ? " login__tab--active" : ""}`}
              onClick={() => setTab("token")}
            >
              令牌登录
            </button>
          </div>

          {tab === "qr" ? (
            <div className="login__form" style={{ alignItems: "center" }}>
              <div className="login__qr" style={{ marginTop: 4 }}>
                {qrImage ? (
                  <img src={qrImage} alt="115 授权二维码" width={196} height={196} />
                ) : (
                  <div className="login__qr-empty">
                    {qrLoading ? "正在申请二维码…" : "点下方按钮获取二维码"}
                  </div>
                )}

                {status === 1 ? (
                  <div className="login__qr-mask">
                    <span className="login__qr-mask-main">已扫码</span>
                    <span className="login__qr-mask-sub">请在手机上点「同意授权」</span>
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

              <p className="login__desc" style={{ marginTop: 12 }}>
                用手机 115 App 扫码，确认授权
              </p>

              <button
                type="button"
                className="login__refresh"
                onClick={() => void startQr()}
                disabled={qrLoading}
              >
                {qrLoading ? "获取中…" : "刷新二维码"}
              </button>

              <p className="login__hint">
                扫码登录需要 115 开放平台的 AppID：去 open.115.com 注册应用，
                把 AppID 填到「设置」里即可。
              </p>
            </div>
          ) : (
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
                  刷新令牌 <em>refresh_token，选填</em>
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
            </div>
          )}

          {tab === "qr" && qrError ? <div className="login__error">{qrError}</div> : null}
          {tab === "token" && tokenError ? <div className="login__error">{tokenError}</div> : null}
          {tab === "qr" && !qrError ? (
            <div className="login__status">{STATUS_TEXT[String(status)] || "等待扫码"}</div>
          ) : null}

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
