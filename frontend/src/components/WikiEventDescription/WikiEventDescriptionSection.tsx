import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { biographyApi } from '../../api/biographyApi';
import { eventTimelineApi } from '../../api/eventTimelineApi';
import { mediaApi } from '../../api/mediaApi';
import styles from '../WikiBiography/WikiBiographySection.module.css';
import type { PersonListItemDto } from '../../types/biography';
import type { TimelineEventDto } from '../../types/eventTimeline';

interface WikiEventDescriptionSectionProps {
  eventId: number;
  description: string | null | undefined;
  isAdmin: boolean;
  onEventUpdated: (updated: TimelineEventDto) => void;
}

interface ParsedSection {
  index: number;
  headingLevel: 2 | 3 | null;
  headingRawText: string | null;
  rawSectionText: string;
  bodyLines: string[];
}

const HEADING_REGEX = /^(#{2,3})\s+(.+)$/;

const splitIntoSections = (content: string): ParsedSection[] => {
  const lines = content.split(/\r?\n/);
  const sections: ParsedSection[] = [];

  let currentHeadingLevel: 2 | 3 | null = null;
  let currentHeadingText: string | null = null;
  let currentRawLines: string[] = [];
  let currentBodyLines: string[] = [];

  const flushSection = () => {
    if (currentHeadingText !== null || currentBodyLines.some(l => l.trim() !== '')) {
      sections.push({
        index: sections.length,
        headingLevel: currentHeadingLevel,
        headingRawText: currentHeadingText,
        rawSectionText: currentRawLines.join('\n').trim(),
        bodyLines: [...currentBodyLines],
      });
    }
  };

  for (const line of lines) {
    const match = HEADING_REGEX.exec(line.trim());
    if (match) {
      flushSection();
      currentHeadingLevel = match[1].length === 2 ? 2 : 3;
      currentHeadingText = match[2].trim();
      currentRawLines = [line];
      currentBodyLines = [];
    } else {
      currentRawLines.push(line);
      currentBodyLines.push(line);
    }
  }
  flushSection();

  return sections;
};

const renderInlineFormatted = (text: string, keyPrefix: string): ReactNode[] => {
  const tokenRegex = /(\[[^\]]+\]\(person:\d+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    const key = `${keyPrefix}-${String(idx)}`;

    if (part.startsWith('[') && part.includes('](person:')) {
      const linkMatch = /^\[([^\]]+)\]\(person:(\d+)\)$/.exec(part);
      if (linkMatch) {
        const label = linkMatch[1];
        const targetId = linkMatch[2];
        return (
          <Link key={key} to={`/biographies/${targetId}`} className={styles.wikiPersonLink}>
            {label}
          </Link>
        );
      }
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      const inner = part.slice(2, -2);
      return <strong key={key}>{renderInlineFormatted(inner, `${key}-b`)}</strong>;
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      const inner = part.slice(1, -1);
      return <em key={key}>{renderInlineFormatted(inner, `${key}-i`)}</em>;
    }

    return part;
  });
};

const renderSectionBody = (lines: string[], sectionKey: string): ReactNode[] => {
  const elements: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed === '') {
      i++;
      continue;
    }

    const mediaMatch = /^!\[([^\]]*)\]\(media:(\d+)\)$/.exec(trimmed);
    if (mediaMatch) {
      const caption = mediaMatch[1];
      const mediaId = Number(mediaMatch[2]);
      elements.push(
        <figure key={`${sectionKey}-media-${String(i)}`} className={styles.wikiMediaFigure}>
          <img
            src={mediaApi.getFileUrl(mediaId)}
            alt={caption}
            className={styles.wikiMediaImg}
          />
          {caption && (
            <figcaption className={styles.wikiMediaCaption}>{caption}</figcaption>
          )}
        </figure>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      elements.push(
        <blockquote
          key={`${sectionKey}-quote-${String(i)}`}
          className={styles.wikiQuoteBox}
          data-testid="wiki-event-quote-box"
        >
          {quoteLines.map((ql, qIdx) => (
            <div key={`${sectionKey}-ql-${String(qIdx)}`}>
              {renderInlineFormatted(ql, `${sectionKey}-q-${String(i)}-${String(qIdx)}`)}
            </div>
          ))}
        </blockquote>
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={`${sectionKey}-ul-${String(i)}`} className={styles.wikiList}>
          {listItems.map((li, lIdx) => (
            <li key={`${sectionKey}-li-${String(lIdx)}`} className={styles.wikiListItem}>
              {renderInlineFormatted(li, `${sectionKey}-l-${String(i)}-${String(lIdx)}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('>') &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !HEADING_REGEX.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    if (paraLines.length > 0) {
      const combined = paraLines.join(' ');
      elements.push(
        <p key={`${sectionKey}-p-${String(i)}`} className={styles.wikiParagraph}>
          {renderInlineFormatted(combined, `${sectionKey}-p-${String(i)}`)}
        </p>
      );
    }
  }

  return elements;
};

const adjustTextareaHeight = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${String(Math.max(150, el.scrollHeight))}px`;
};

export default function WikiEventDescriptionSection({
  eventId,
  description,
  isAdmin,
  onEventUpdated,
}: WikiEventDescriptionSectionProps) {
  const [editMode, setEditMode] = useState<'FULL' | number | null>(null);
  const [draftText, setDraftText] = useState<string>('');
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showLinkPicker, setShowLinkPicker] = useState<boolean>(false);
  const [personSearchQuery, setPersonSearchQuery] = useState<string>('');
  const [personSearchResults, setPersonSearchResults] = useState<PersonListItemDto[]>([]);
  const [customLinkLabel, setCustomLinkLabel] = useState<string>('');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const syncHeight = () => {
      adjustTextareaHeight(textareaRef.current);
    };
    if (editMode !== null) {
      syncHeight();
    }

    window.addEventListener('resize', syncHeight);
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            syncHeight();
          })
        : null;

    if (observer && editMode !== null && textareaRef.current) {
      observer.observe(textareaRef.current);
    }

    return () => {
      window.removeEventListener('resize', syncHeight);
      observer?.disconnect();
    };
  }, [editMode, draftText]);

  const sections = description ? splitIntoSections(description) : [];
  const hasAnySectionHeading = sections.some(s => s.headingLevel !== null);

  const handleStartFullEdit = () => {
    setDraftText(description ?? '');
    setEditMode('FULL');
    setShowLinkPicker(false);
    setErrorMessage(null);
  };

  const handleStartSectionEdit = (sec: ParsedSection) => {
    setDraftText(sec.rawSectionText);
    setEditMode(sec.index);
    setShowLinkPicker(false);
    setErrorMessage(null);
  };

  const applyWrapOrPrefix = (
    type: 'H2' | 'H3' | 'BOLD' | 'ITALIC' | 'LIST' | 'QUOTE'
  ) => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = draftText.slice(start, end);
    const before = draftText.slice(0, start);
    const after = draftText.slice(end);

    let replacement = '';
    if (type === 'BOLD') {
      replacement = `**${selected || 'pogrubiony tekst'}**`;
    } else if (type === 'ITALIC') {
      replacement = `*${selected || 'tekst kursywą'}*`;
    } else if (type === 'H2') {
      const prefix = before.endsWith('\n') || before === '' ? '' : '\n\n';
      replacement = `${prefix}## ${selected || 'Tytuł sekcji'}\n`;
    } else if (type === 'H3') {
      const prefix = before.endsWith('\n') || before === '' ? '' : '\n\n';
      replacement = `${prefix}### ${selected || 'Tytuł podsekcji'}\n`;
    } else if (type === 'LIST') {
      const lines = (selected || 'Pierwszy element listy\nDrugi element listy').split('\n');
      const prefix = before.endsWith('\n') || before === '' ? '' : '\n';
      replacement = `${prefix}${lines.map(l => `- ${l.replace(/^[-*]\s+/, '')}`).join('\n')}\n`;
    } else {
      const lines = (selected || 'Treść cytatu lub wspomnienia w ramce...').split('\n');
      const prefix = before.endsWith('\n') || before === '' ? '' : '\n';
      replacement = `${prefix}${lines.map(l => `> ${l.replace(/^>\s?/, '')}`).join('\n')}\n`;
    }

    const nextText = before + replacement + after;
    setDraftText(nextText);
    el.focus();
  };

  const handleOpenLinkPicker = () => {
    const el = textareaRef.current;
    if (el && el.selectionStart !== el.selectionEnd) {
      const sel = draftText.slice(el.selectionStart, el.selectionEnd).trim();
      setCustomLinkLabel(sel);
      setPersonSearchQuery(sel);
    } else {
      setCustomLinkLabel('');
    }
    setShowLinkPicker(prev => !prev);
  };

  const handleSearchPersonForLink = async () => {
    try {
      const page = await biographyApi.listPeople({
        search: personSearchQuery,
        includeArchived: true,
        page: 0,
        size: 6,
      });
      setPersonSearchResults(page.content);
    } catch {
      setErrorMessage('Nie udało się wyszukać osób.');
    }
  };

  const handleInsertPersonLink = (p: PersonListItemDto) => {
    const defaultName = `${p.givenName ?? ''} ${p.surname ?? ''}`.trim();
    const labelToUse = customLinkLabel.trim() !== '' ? customLinkLabel.trim() : defaultName;
    const markdownLink = `[${labelToUse}](person:${String(p.id)})`;

    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const nextText = draftText.slice(0, start) + markdownLink + draftText.slice(end);
      setDraftText(nextText);
    } else {
      setDraftText(prev => `${prev} ${markdownLink}`);
    }

    setShowLinkPicker(false);
    setPersonSearchResults([]);
    setPersonSearchQuery('');
    setCustomLinkLabel('');
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      let finalContent = draftText;

      if (typeof editMode === 'number') {
        const updatedSections = sections.map(s =>
          s.index === editMode ? draftText.trim() : s.rawSectionText
        );
        finalContent = updatedSections.filter(Boolean).join('\n\n');
      }

      const updatedEvt = await eventTimelineApi.updateEventDetails(eventId, {
        description: finalContent,
      });
      onEventUpdated(updatedEvt);
      setEditMode(null);
    } catch {
      setErrorMessage('Nie udało się zapisać opisu wydarzenia.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderEditorBox = () => (
    <div className={styles.editorContainer} data-testid="wiki-event-description-editor">
      <div className={styles.editorHeader}>
        <span className={styles.editorTitle}>
          {editMode === 'FULL'
            ? 'Edycja całego opisu wydarzenia'
            : 'Edycja wybranej sekcji opisu'}
        </span>
        <button
          type="button"
          onClick={() => {
            setShowPreview(prev => !prev);
          }}
          className={`${styles.toolBtn} ${showPreview ? styles.toolBtnActive : ''}`}
        >
          👁️ {showPreview ? 'Ukryj podgląd na żywo' : 'Pokaż podgląd na żywo'}
        </button>
      </div>

      <div className={styles.toolbar}>
        <button
          type="button"
          title="Dodaj główny nagłówek sekcji z linią (##)"
          onClick={() => {
            applyWrapOrPrefix('H2');
          }}
          className={styles.toolBtn}
        >
          H2 Sekcja
        </button>
        <button
          type="button"
          title="Dodaj podsekcję (###)"
          onClick={() => {
            applyWrapOrPrefix('H3');
          }}
          className={styles.toolBtn}
        >
          H3 Podsekcja
        </button>
        <button
          type="button"
          title="Pogrubienie (**tekst**)"
          onClick={() => {
            applyWrapOrPrefix('BOLD');
          }}
          className={styles.toolBtn}
        >
          <strong>B</strong> Pogrubienie
        </button>
        <button
          type="button"
          title="Kursywa (*tekst*)"
          onClick={() => {
            applyWrapOrPrefix('ITALIC');
          }}
          className={styles.toolBtn}
        >
          <em>I</em> Kursywa
        </button>
        <button
          type="button"
          title="Lista kropkowana (- element)"
          onClick={() => {
            applyWrapOrPrefix('LIST');
          }}
          className={styles.toolBtn}
        >
          • Lista kropkowana
        </button>
        <button
          type="button"
          title="Cytat w ramce (> tekst)"
          onClick={() => {
            applyWrapOrPrefix('QUOTE');
          }}
          className={styles.toolBtn}
        >
          „” Cytat w ramce
        </button>
        <button
          type="button"
          onClick={handleOpenLinkPicker}
          className={`${styles.toolBtn} ${showLinkPicker ? styles.toolBtnActive : ''}`}
        >
          🔗 Link do osoby z drzewa
        </button>
      </div>

      {showLinkPicker && (
        <div className={styles.linkPickerBox}>
          <div className={styles.linkPickerRow}>
            <input
              type="text"
              placeholder="Tekst linku w zdaniu (np. Janem Kowalskim)..."
              value={customLinkLabel}
              onChange={e => {
                setCustomLinkLabel(e.target.value);
              }}
              className={styles.textInput}
            />
            <input
              type="text"
              placeholder="Szukaj osoby w bazie..."
              value={personSearchQuery}
              onChange={e => {
                setPersonSearchQuery(e.target.value);
              }}
              className={styles.textInput}
            />
            <button
              type="button"
              onClick={() => {
                void handleSearchPersonForLink();
              }}
              className={styles.btnSecondary}
            >
              Szukaj
            </button>
          </div>

          {personSearchResults.length > 0 && (
            <div className={styles.linkPickerRow}>
              {personSearchResults.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    handleInsertPersonLink(p);
                  }}
                  className={styles.toolBtn}
                >
                  + Wstaw link: {p.givenName} {p.surname} ({p.birthYear ?? '?'}–
                  {p.deathYear ?? '?'})
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <textarea
        ref={textareaRef}
        data-testid="wiki-event-description-textarea"
        placeholder="Wpisz opis wydarzenia... Użyj ## dla sekcji, ### dla podsekcji, **pogrubienia**, *kursywy*, - dla listy lub > dla cytatu w ramce."
        value={draftText}
        onChange={e => {
          setDraftText(e.target.value);
          adjustTextareaHeight(e.target);
        }}
        className={styles.editorTextarea}
      />

      <div className={styles.editorHint}>
        Wskazówka: <code>## Nagłówek sekcji</code> tworzy sekcję,{' '}
        <code>### Podsekcja</code> tworzy podsekcję, <code>&gt; Tekst</code> tworzy cytat w
        ramce, <code>- Element</code> tworzy listę kropkowaną, a{' '}
        <code>[Tekst](person:ID)</code> tworzy link do osoby.
      </div>

      {showPreview && draftText.trim() !== '' && (
        <div className={styles.previewBox}>
          <span className={styles.previewLabel}>Podgląd wyglądu na stronie:</span>
          <div className={styles.wikiArticleBody}>
            {splitIntoSections(draftText).map(sec => (
              <div key={`prev-${String(sec.index)}`} className={styles.wikiSectionBlock}>
                {sec.headingLevel === 2 && sec.headingRawText && (
                  <h2 className={styles.wikiH2}>
                    <span>
                      {renderInlineFormatted(
                        sec.headingRawText,
                        `prev-h2-${String(sec.index)}`
                      )}
                    </span>
                  </h2>
                )}
                {sec.headingLevel === 3 && sec.headingRawText && (
                  <h3 className={styles.wikiH3}>
                    <span>
                      {renderInlineFormatted(
                        sec.headingRawText,
                        `prev-h3-${String(sec.index)}`
                      )}
                    </span>
                  </h3>
                )}
                {renderSectionBody(sec.bodyLines, `prev-sec-${String(sec.index)}`)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.editorActions}>
        <button
          type="button"
          onClick={() => {
            setEditMode(null);
          }}
          className={styles.btnSecondary}
        >
          Anuluj
        </button>
        <button
          type="button"
          data-testid="save-wiki-event-description-button"
          disabled={isSaving}
          onClick={() => {
            void handleSave();
          }}
          className={styles.btnPrimary}
        >
          {isSaving ? 'Zapisywanie...' : 'Zapisz opis wydarzenia'}
        </button>
      </div>
    </div>
  );

  return (
    <section className={styles.wikiSectionCard} data-testid="wiki-event-description-section">
      {!hasAnySectionHeading ? (
        <div className={styles.topHeaderRow}>
          <h2 className={styles.mainSectionTitle}>Opis i przebieg wydarzenia</h2>

          {isAdmin && editMode === null && (
            <button
              type="button"
              data-testid="edit-full-event-description-button"
              onClick={handleStartFullEdit}
              className={styles.btnSecondary}
            >
              ✏️ {description ? 'Edytuj cały opis' : 'Dodaj opis wydarzenia'}
            </button>
          )}
        </div>
      ) : (
        isAdmin &&
        editMode === null && (
          <div className={styles.topActionsOnlyRow}>
            <button
              type="button"
              data-testid="edit-full-event-description-button"
              onClick={handleStartFullEdit}
              className={styles.btnSecondary}
            >
              ✏️ Edytuj cały opis wydarzenia
            </button>
          </div>
        )
      )}

      {errorMessage && (
        <div role="alert" style={{ color: '#dc2626', fontSize: '0.88rem', fontWeight: 600 }}>
          {errorMessage}
        </div>
      )}

      {editMode === 'FULL' ? (
        renderEditorBox()
      ) : !description || sections.length === 0 ? (
        <div className={styles.placeholderBox}>
          Brak opracowanego opisu tekstowego dla tego wydarzenia.
        </div>
      ) : (
        <div className={styles.wikiArticleBody}>
          {sections.map(sec => {
            if (editMode === sec.index) {
              return <div key={`edit-sec-${String(sec.index)}`}>{renderEditorBox()}</div>;
            }

            return (
              <div
                key={`sec-${String(sec.index)}`}
                className={styles.wikiSectionBlock}
              >
                {sec.headingLevel === 2 && sec.headingRawText && (
                  <h2 className={styles.wikiH2}>
                    <span>
                      {renderInlineFormatted(
                        sec.headingRawText,
                        `h2-${String(sec.index)}`
                      )}
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        data-testid={`edit-event-section-btn-${String(sec.index)}`}
                        onClick={() => {
                          handleStartSectionEdit(sec);
                        }}
                        className={styles.wikiEditSectionBtn}
                      >
                        ✏️ Edytuj
                      </button>
                    )}
                  </h2>
                )}

                {sec.headingLevel === 3 && sec.headingRawText && (
                  <h3 className={styles.wikiH3}>
                    <span>
                      {renderInlineFormatted(
                        sec.headingRawText,
                        `h3-${String(sec.index)}`
                      )}
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        data-testid={`edit-event-section-btn-${String(sec.index)}`}
                        onClick={() => {
                          handleStartSectionEdit(sec);
                        }}
                        className={styles.wikiEditSectionBtn}
                      >
                        ✏️ Edytuj
                      </button>
                    )}
                  </h3>
                )}

                {renderSectionBody(sec.bodyLines, `sec-${String(sec.index)}`)}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}