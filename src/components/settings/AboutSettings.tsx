import { useAppStore } from '../../store/appStore';
import { Badge, Button, SectionLabel } from '../ui/primitives';
import { Icon } from '../ui/Icon';

export function AboutSettings() {
  const updateSettings = useAppStore((state) => state.updateSettings);
  const serverConfig = useAppStore((state) => state.serverConfig);
  const openModal = useAppStore((state) => state.openModal);

  return (
    <div className="settings-section about-section">
      <div className="about-hero">
        <span className="brand-mark about-mark">
          <Icon name="wand" size={24} />
        </span>
        <div>
          <h3>FS-Prompt Studio</h3>
          <p>中文优先的 AI 生图提示词编辑器 · v1.3.0</p>
        </div>
        <Badge tone="accent">本地优先</Badge>
      </div>

      <p className="about-text">
        为不熟悉英文提示词语法的中文用户设计。写中文草稿，翻译成英文提示词，逐段对照检查，
        用片段控制标签，管理 LoRA 与权重，保存成品与历史版本。所有数据默认只保存在当前浏览器。
      </p>

      <SectionLabel>核心能力</SectionLabel>
      <ul className="settings-list">
        <li>草稿独立一个框；翻译区中文 / 英文两个框，双向翻译与真实分段对照。</li>
        <li>中文和英文都支持片段模式：点单词或单句写入 ( ) / [ ] 加权、降权。</li>
        <li>输入 @ 自动弹出 LoRA 触发词列表，选中后插入 @dizzy / @FSYL001 / @wins。</li>
        <li>翻译自动保护 @触发词与 LoRA 库触发词，不会翻成普通词义。</li>
        <li>负面提示词有中文 / 英文两个框，可复制正向翻译并随成品、历史与备份保存。</li>
        <li>LoRA 记事本：多个推荐前缀、推荐负面提示词，点击 @触发词 复制并加入英文提示词。</li>
        <li>右侧小翻译可随时输入文字翻译并复制；成品、历史、TXT / JSON / ComfyUI 工作流导出。</li>
        <li>本地数据备份、导入校验、合并或替换导入、一键清除。</li>
        <li>顶部「前往生图」可打开自定义 ComfyUI 地址；附带 Windows 双击启动脚本。</li>
      </ul>

      <SectionLabel>隐私与数据</SectionLabel>
      <ul className="settings-list">
        <li>草稿、LoRA、成品、历史与设置保存在浏览器 IndexedDB，不会默认上传。</li>
        <li>只有点击翻译时，待翻译的文本才会通过本地后端发送到当前翻译服务。</li>
        <li>API Key 只保存在服务端配置文件或环境变量中，浏览器只能看到“是否已配置”。</li>
        <li>
          当前翻译目的地：<strong>{serverConfig?.dataDestination ?? '后端未连接'}</strong>
        </li>
      </ul>

      <SectionLabel>已知限制</SectionLabel>
      <ul className="settings-list">
        <li>免费 Google 公共接口为非官方通道，可能限流或不可用；正式使用请配置自己的 API。</li>
        <li>翻译对齐以请求片段为单位，短标签可逐词对应，长句按整句对照，不做语义分词。</li>
        <li>中文片段使用轻量分词，个别词组可能切得不够准；可切「按单句」或直接编辑。</li>
        <li>片段加权按钮只增加/移除一层 () / []，不自动填写数字权重。</li>
        <li>LoRA 推荐前缀需要手动加入英文开头，推荐负面需要手动加入负面英文，不会自动改写译文。</li>
        <li>自定义词典目前只注入 OpenAI 兼容接口；Google 公共接口与 DeepL 不应用术语表。</li>
        <li>ComfyUI 工作流导出只支持 API 格式，并要求手动配置节点映射；不是所有工作流都兼容。</li>
        <li>FLUX / SDXL / SD1.5 对权重语法与 LoRA 文本的支持依赖具体前端，预设只提供默认输出习惯。</li>
        <li>数据保存在单个浏览器中，清理浏览器数据会丢失；请定期导出备份。</li>
      </ul>

      <SectionLabel>快捷键</SectionLabel>
      <div className="shortcut-grid">
        <span>
          <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>S</kbd> 保存
        </span>
        <span>
          <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd> 翻译
        </span>
        <span>
          <kbd>Ctrl</kbd> + <kbd>Z</kbd> 撤销
        </span>
        <span>
          <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> 重做
        </span>
      </div>

      <div className="about-actions">
        <Button
          variant="secondary"
          icon="sparkles"
          onClick={() => {
            updateSettings({ onboardingSeen: false });
            useAppStore.getState().closeModal();
          }}
        >
          重新显示新手引导
        </Button>
        <Button variant="ghost" icon="database" onClick={() => openModal({ type: 'settings', section: 'data' })}>
          备份数据
        </Button>
      </div>

      <p className="about-footer">
        本应用与 Stability AI、Black Forest Labs、ComfyUI、Google、OpenAI、DeepL 无隶属关系。
        提示词与生成结果由用户自行负责。
      </p>
    </div>
  );
}
