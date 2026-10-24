import { useAppStore } from '../store/appStore';
import { Icon } from './ui/Icon';
import { Button } from './ui/primitives';

export function Onboarding() {
  const hydrated = useAppStore((state) => state.hydrated);
  const seen = useAppStore((state) => state.settings.onboardingSeen);
  const complete = useAppStore((state) => state.completeOnboarding);
  const openModal = useAppStore((state) => state.openModal);

  if (!hydrated || seen) return null;

  return (
    <section className="onboarding" aria-label="新手引导">
      <div className="onboarding-icon">
        <Icon name="sparkles" size={22} />
      </div>
      <div className="onboarding-content">
        <div className="onboarding-title">第一次使用？三步生成第一条提示词</div>
        <ol className="onboarding-steps">
          <li>
            <strong>写草稿</strong>
            <span>用中文描述想生成的画面，支持中英混合。</span>
          </li>
          <li>
            <strong>点翻译</strong>
            <span>生成英文提示词，可开启「对照翻译」逐段检查。</span>
          </li>
          <li>
            <strong>生成成品</strong>
            <span>选好 LoRA 与权重后生成，自动保存到历史记录。</span>
          </li>
        </ol>
        <p className="onboarding-note">
          数据默认只保存在本浏览器；只有在点击翻译时，文本才会发送到你配置的翻译服务。
        </p>
      </div>
      <div className="onboarding-actions">
        <Button size="sm" variant="ghost" onClick={() => openModal({ type: 'settings', section: 'translate' })}>
          配置翻译服务
        </Button>
        <Button size="sm" variant="primary" icon="check" onClick={complete}>
          知道了
        </Button>
      </div>
    </section>
  );
}
