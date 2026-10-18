import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icons";
import { call, isTauri } from "@/lib/bridge";
import type { AppSettings } from "@/lib/types";

interface SettingsPageProps {
  onNotify: (message: string) => void;
}

export function SettingsPage({ onNotify }: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState<{ enabled: boolean; cached: number }>({
    enabled: false,
    cached: 0,
  });
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const result = await call<[boolean, number]>("tmdb_status");
      setStatus({ enabled: result[0], cached: result[1] });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void (async () => {
      try {
        setSettings(await call<AppSettings>("get_settings"));
      } catch (err) {
        onNotify(String(err));
      }
      void refreshStatus();
    })();
  }, [onNotify, refreshStatus]);

  const patch = (key: keyof AppSettings, value: string) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await call("save_settings", { settings });
      onNotify("设置已保存");
      await refreshStatus();
    } catch (err) {
      onNotify(String(err));
    } finally {
      setSaving(false);
    }
  };

  const clearCache = async () => {
    setClearing(true);
    try {
      const removed = await call<number>("clear_poster_cache");
      onNotify(`已清理 ${removed} 张缓存海报`);
      await refreshStatus();
    } catch (err) {
      onNotify(String(err));
    } finally {
      setClearing(false);
    }
  };

  if (!settings) {
    return (
      <main className="content">
        <div className="empty">
          <div className="spinner" />
          <span>正在读取设置…</span>
        </div>
      </main>
    );
  }

  return (
    <main className="content">
      <div className="pathbar">
        <span className="pathbar__crumb pathbar__crumb--current">设置</span>
      </div>

      <div className="toolbox">
        <section className="tool-card">
          <div className="tool-card__head">
            <Icon name="film" size={16} />
            <h3>媒体库元数据（TMDb）</h3>
          </div>
          <p>
            115 不返回视频封面，海报需要从 TMDb 抓。密钥免费申请：
            themoviedb.org → Settings → API。
            {status.enabled ? ` 当前已启用，本地缓存 ${status.cached} 张。` : " 当前未启用。"}
          </p>

          <label className="login__field">
            <span className="login__field-label">
              API Key <em>v3 auth，32 位</em>
            </span>
            <input
              className="modal__input"
              value={settings.tmdb_key}
              spellCheck={false}
              placeholder="粘贴 TMDb 的 API Key"
              onChange={(event) => patch("tmdb_key", event.target.value)}
            />
          </label>

          <div className="settings-row">
            <button
              type="button"
              className="modal__btn modal__btn--primary"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              className="modal__btn"
              onClick={() => void clearCache()}
              disabled={clearing || status.cached === 0}
            >
              {clearing ? "清理中…" : "清空海报缓存"}
            </button>
          </div>
        </section>

        <section className="tool-card">
          <div className="tool-card__head">
            <Icon name="lock" size={16} />
            <h3>扫码登录（115 开放平台）</h3>
          </div>
          <p>
            填了 AppID 才能在登录页用手机扫码授权，token 会自动续期。
            去 open.115.com 注册应用即可获取；不填则只能用令牌登录。
          </p>

          <label className="login__field">
            <span className="login__field-label">
              AppID <em>client_id</em>
            </span>
            <input
              className="modal__input"
              value={settings.open_client_id}
              spellCheck={false}
              placeholder="例如 8xxxxxxx-xxxxxxxx"
              onChange={(event) => patch("open_client_id", event.target.value)}
            />
          </label>

          <div className="settings-row">
            <button
              type="button"
              className="modal__btn modal__btn--primary"
              onClick={() => void save()}
              disabled={saving}
            >
              保存
            </button>
          </div>
        </section>

        <section className="tool-card">
          <div className="tool-card__head">
            <Icon name="cloud" size={16} />
            <h3>网络</h3>
          </div>
          <p>
            TMDb 的接口和图片在国内直连不通，需要走代理。留空则读系统环境变量
            HTTPS_PROXY。海报下载后会存到本地，代理关掉也能显示已缓存的图。
          </p>

          <label className="login__field">
            <span className="login__field-label">代理地址</span>
            <input
              className="modal__input"
              value={settings.proxy}
              spellCheck={false}
              placeholder="http://127.0.0.1:10808"
              onChange={(event) => patch("proxy", event.target.value)}
            />
          </label>

          <div className="settings-row">
            <button
              type="button"
              className="modal__btn modal__btn--primary"
              onClick={() => void save()}
              disabled={saving}
            >
              保存
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
