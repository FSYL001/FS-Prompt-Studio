import { useAppStore } from '../store/appStore';
import { Icon } from './ui/Icon';
import { Button } from './ui/primitives';

export function ServiceBanner() {
  const serverConfig = useAppStore((state) => state.serverConfig);
  const error = useAppStore((state) => state.serverConfigError);
  const translateBusy = useAppStore((state) => state.translateBusy);
  const refresh = useAppStore((state) => state.refreshServerConfig);
  const openModal = useAppStore((state) => state.openModal);

  if (translateBusy) return null;

  if (error) {
    return (
      <div className="service-banner service-banner-error" role="alert">
        <Icon name="alert" size={17} />
        <span>后端翻译服务不可用：{error}</span>
        <div className="service-banner-actions">
          <Button size="sm" variant="ghost" icon="refresh" onClick={() => void refresh(true)}>
            重新检测
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openModal({ type: 'settings', section: 'translate' })}>
            设置
          </Button>
        </div>
      </div>
    );
  }

  if (!serverConfig) return null;

  if (serverConfig.isMock) {
    return (
      <div className="service-banner service-banner-warning" role="status">
        <Icon name="alert" size={17} />
        <span>
          <strong>当前为模拟翻译模式</strong>：只做少量词典替换，不是真实翻译。配置真实翻译服务后再正式使用。
        </span>
        <div className="service-banner-actions">
          <Button size="sm" variant="ghost" onClick={() => openModal({ type: 'settings', section: 'translate' })}>
            去配置
          </Button>
        </div>
      </div>
    );
  }

  if (serverConfig.requiresKey && !serverConfig.hasKey) {
    return (
      <div className="service-banner service-banner-warning" role="status">
        <Icon name="alert" size={17} />
        <span>
          已选择 <strong>{serverConfig.label}</strong>，但还没有配置 API Key，翻译会失败。
        </span>
        <div className="service-banner-actions">
          <Button size="sm" variant="ghost" onClick={() => openModal({ type: 'settings', section: 'translate' })}>
            填写密钥
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
