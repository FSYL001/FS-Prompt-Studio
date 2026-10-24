import { useEffect, useState } from 'react';
import type { DictionaryEntry } from '../../domain/types';
import { useAppStore } from '../../store/appStore';
import { Button, IconButton, InlineWarning, SectionLabel } from '../ui/primitives';

function DictionaryRow({
  entry,
  index,
  onCommit,
  onDelete,
}: {
  entry: DictionaryEntry;
  index: number;
  onCommit: (index: number, entry: DictionaryEntry) => void;
  onDelete: (index: number) => void;
}) {
  const toast = useAppStore((state) => state.toast);
  const [cn, setCn] = useState(entry.cn);
  const [en, setEn] = useState(entry.en);

  useEffect(() => {
    setCn(entry.cn);
    setEn(entry.en);
  }, [entry.cn, entry.en]);

  const commit = () => {
    if (!cn.trim()) {
      setCn(entry.cn);
      toast('中文词不能为空，已还原上一条内容。', 'warning');
      return;
    }
    if (cn !== entry.cn || en !== entry.en) {
      onCommit(index, { cn: cn.trim(), en: en.trim() });
    }
  };

  return (
    <div className="dict-row">
      <input
        className="input"
        value={cn}
        onChange={(event) => setCn(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
        }}
        placeholder="中文词 / 短语"
        aria-label={`词典第 ${index + 1} 条中文`}
      />
      <span className="dict-arrow" aria-hidden>
        →
      </span>
      <input
        className="input"
        value={en}
        onChange={(event) => setEn(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
        }}
        placeholder="固定英文译法"
        aria-label={`词典第 ${index + 1} 条英文`}
      />
      <IconButton
        icon="trash"
        label="删除这条词典"
        size="sm"
        onClick={() => onDelete(index)}
      />
    </div>
  );
}

export function DictionarySettings() {
  const dictionary = useAppStore((state) => state.settings.dictionary);
  const addEntry = useAppStore((state) => state.addDictionaryEntry);
  const updateEntry = useAppStore((state) => state.updateDictionaryEntry);
  const removeEntry = useAppStore((state) => state.removeDictionaryEntry);

  const [newCn, setNewCn] = useState('');
  const [newEn, setNewEn] = useState('');

  const add = () => {
    if (!newCn.trim() || !newEn.trim()) return;
    addEntry({ cn: newCn.trim(), en: newEn.trim() });
    setNewCn('');
    setNewEn('');
  };

  return (
    <div className="settings-section">
      <SectionLabel hint={`${dictionary.length} 条`}>自定义词典 / 固定译法</SectionLabel>
      <p className="settings-note">
        用于固定专业词、角色名、画风名的译法。词典会随请求发送给支持的翻译服务（OpenAI
        兼容接口）；Google 公共接口与 DeepL 当前不会应用术语表，因此不保证固定译法。
      </p>

      {dictionary.length === 0 ? (
        <div className="dict-empty">还没有自定义词条。添加后，翻译会优先尊重你的固定译法。</div>
      ) : (
        <div className="dict-list">
          {dictionary.map((entry, index) => (
            <DictionaryRow
              key={`${index}-${entry.cn}`}
              entry={entry}
              index={index}
              onCommit={updateEntry}
              onDelete={removeEntry}
            />
          ))}
        </div>
      )}

      <div className="dict-add">
        <input
          className="input"
          value={newCn}
          onChange={(event) => setNewCn(event.target.value)}
          placeholder="中文，例如：樱花"
          aria-label="新的中文词"
        />
        <span className="dict-arrow" aria-hidden>
          →
        </span>
        <input
          className="input"
          value={newEn}
          onChange={(event) => setNewEn(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') add();
          }}
          placeholder="英文，例如：cherry blossoms"
          aria-label="新的英文译法"
        />
        <Button
          variant="secondary"
          icon="plus"
          onClick={add}
          disabled={!newCn.trim() || !newEn.trim() || dictionary.length >= 500}
        >
          添加
        </Button>
      </div>

      <InlineWarning>
        词典只影响翻译请求，不会修改你已经写好的提示词。免费公共翻译接口可能忽略固定译法。
      </InlineWarning>
    </div>
  );
}
