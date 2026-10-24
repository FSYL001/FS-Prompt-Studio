import { useState } from 'react';
import type { Product } from '../domain/types';
import { buildJsonExport, buildTxtExport } from '../domain/product';
import { formatDateTime, downloadText, copyText } from '../domain/id';
import { modelTypeLabel } from '../domain/presets';
import { useAppStore } from '../store/appStore';
import { Icon } from './ui/Icon';
import { Badge, Button, Card, EmptyState, IconButton } from './ui/primitives';

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'prompt';
}

function ProductCard({ product }: { product: Product }) {
  const [expanded, setExpanded] = useState(false);
  const toast = useAppStore((state) => state.toast);
  const confirmAction = useAppStore((state) => state.confirmAction);
  const toggleFavorite = useAppStore((state) => state.toggleProductFavorite);
  const deleteProduct = useAppStore((state) => state.deleteProduct);
  const openModal = useAppStore((state) => state.openModal);
  const reloadProduct = useAppStore((state) => state.reloadProduct);

  const copy = async (text: string, label: string) => {
    if (!text.trim()) {
      toast(`${label}为空。`, 'info');
      return;
    }
    try {
      await copyText(text);
      toast(`${label}已复制。`, 'success');
    } catch (error) {
      toast(`复制失败：${error instanceof Error ? error.message : '未知错误'}`, 'error');
    }
  };

  const handleDelete = () => {
    confirmAction({
      title: '删除这个成品？',
      message: `「${product.name}」将被删除。历史记录中的快照仍会保留，可随时从历史恢复。`,
      confirmLabel: '删除成品',
      danger: true,
      onConfirm: () => deleteProduct(product.id),
    });
  };

  const exportTxt = () => {
    downloadText(`${safeFileName(product.name)}.txt`, buildTxtExport(product, true));
    toast('TXT 已导出。', 'success');
  };

  const exportJson = () => {
    downloadText(
      `${safeFileName(product.name)}.json`,
      buildJsonExport(product),
      'application/json;charset=utf-8',
    );
    toast('JSON 已导出。', 'success');
  };

  return (
    <article className={`product-card ${product.favorite ? 'is-favorite' : ''}`}>
      <header className="product-head">
        <div className="product-title-block">
          <div className="product-title-row">
            <h3 className="product-name" title={product.name}>
              {product.name}
            </h3>
            {product.favorite ? <Icon name="star-filled" size={15} className="favorite-mark" /> : null}
          </div>
          <div className="product-meta">
            <span>{formatDateTime(product.createdAt)}</span>
            <span className="dot" aria-hidden>
              ·
            </span>
            <Badge tone="outline">{modelTypeLabel(product.params.modelType)}</Badge>
            {product.loras.length > 0 ? (
              <>
                <span className="dot" aria-hidden>
                  ·
                </span>
                <span>{product.loras.filter((lora) => lora.enabled).length} 个 LoRA</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="product-head-actions">
          <IconButton
            icon={product.favorite ? 'star-filled' : 'star'}
            label={product.favorite ? '取消收藏' : '收藏成品'}
            size="sm"
            active={product.favorite}
            onClick={() => toggleFavorite(product.id)}
          />
          <IconButton
            icon="edit"
            label="编辑成品"
            size="sm"
            onClick={() => openModal({ type: 'product-edit', productId: product.id })}
          />
          <IconButton icon="trash" label="删除成品" size="sm" onClick={handleDelete} />
        </div>
      </header>

      <div className={`product-prompts ${expanded ? 'is-expanded' : ''}`}>
        <div className="product-prompt-block">
          <span className="prompt-label">正向</span>
          <p className="prompt-text">{product.positive || '（空）'}</p>
        </div>
        {product.negative ? (
          <div className="product-prompt-block is-negative">
            <span className="prompt-label">负向</span>
            <p className="prompt-text">{product.negative}</p>
            {product.negativeZhText ? (
              <p className="product-negative-zh">中文负面：{product.negativeZhText}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {product.loras.length > 0 ? (
        <div className="product-loras">
          {product.loras.map((lora, index) => (
            <span className="lora-chip" key={`${lora.name}-${index}`} title={lora.file}>
              <Icon name="layers" size={12} />
              {lora.name || '未命名'}
              <b>{Math.round(lora.weight * 100) / 100}</b>
            </span>
          ))}
        </div>
      ) : null}

      {product.notes.trim() ? <p className="product-notes">{product.notes}</p> : null}

      <footer className="product-actions">
        <Button size="sm" variant="primary" icon="copy" onClick={() => void copy(product.final, '完整提示词')}>
          复制完整
        </Button>
        <Button size="sm" variant="secondary" icon="copy" onClick={() => void copy(product.positive, '正向提示词')}>
          纯提示词
        </Button>
        <Button size="sm" variant="ghost" icon="upload" onClick={() => void reloadProduct(product.id)}>
          载入编辑器
        </Button>
        <details className="export-menu">
          <summary className="export-summary">
            <Icon name="download" size={15} /> 导出
            <Icon name="chevron-down" size={14} />
          </summary>
          <div className="export-menu-list">
            <button type="button" onClick={exportTxt}>
              <Icon name="download" size={14} /> 导出 TXT
            </button>
            <button type="button" onClick={exportJson}>
              <Icon name="download" size={14} /> 导出 JSON
            </button>
            <button
              type="button"
              onClick={() => openModal({ type: 'workflow-export', productId: product.id })}
            >
              <Icon name="workflow" size={14} /> ComfyUI 工作流…
            </button>
            <button type="button" onClick={() => setExpanded((value) => !value)}>
              <Icon name="eye" size={14} /> {expanded ? '收起内容' : '查看完整内容'}
            </button>
          </div>
        </details>
      </footer>
    </article>
  );
}

export function ProductsPanel() {
  const products = useAppStore((state) => state.products);
  const generating = useAppStore((state) => state.generating);
  const generateProduct = useAppStore((state) => state.generateProduct);
  const englishText = useAppStore((state) => state.workspace.englishText);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? products : products.slice(0, 6);
  const favorites = products.filter((product) => product.favorite).length;

  return (
    <Card
      className="products-card"
      id="products"
      title={
        <span className="panel-title">
          <span className="panel-step">3</span>
          成品提示词
          {products.length > 0 ? <Badge tone="neutral">{products.length}</Badge> : null}
          {favorites > 0 ? <Badge tone="warning">{favorites} 个收藏</Badge> : null}
        </span>
      }
      subtitle="生成成品不会清空或覆盖草稿。每条成品保存当时的提示词、LoRA、参数与备注。"
      actions={
        <Button
          variant="primary"
          icon="sparkles"
          loading={generating}
          onClick={() => void generateProduct()}
          disabled={!englishText.trim()}
          title={!englishText.trim() ? '请先输入或翻译英文提示词' : '根据当前内容生成成品'}
        >
          生成成品
        </Button>
      }
    >
      {products.length === 0 ? (
        <EmptyState
          icon="sparkles"
          title="还没有成品"
          description={
            englishText.trim()
              ? '点击「生成成品」记录当前提示词、LoRA 与参数，并自动写入历史记录。'
              : '先把草稿翻译成英文提示词，再生成成品。'
          }
          action={
            <Button
              variant="secondary"
              icon="sparkles"
              onClick={() => void generateProduct()}
              disabled={!englishText.trim()}
            >
              生成第一条成品
            </Button>
          }
        />
      ) : (
        <>
          <div className="product-grid">
            {visible.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          {products.length > 6 ? (
            <div className="products-more">
              <Button size="sm" variant="ghost" onClick={() => setShowAll((value) => !value)}>
                {showAll ? '收起' : `显示全部 ${products.length} 条`}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
