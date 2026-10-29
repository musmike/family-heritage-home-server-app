import { useState, useEffect, use } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { burialApi } from '../../api/burialApi';
import { biographyApi } from '../../api/biographyApi';
import { AuthContext } from '../../context/AuthContext';
import Loader from '../../components/Loader/Loader';
import PersonAvatar from '../../components/PersonAvatar/PersonAvatar';
import styles from './BurialsPage.module.css';
import type {
  BurialPersonItemDto,
  CemeteryGroupDto,
  GraveGroupDto,
} from '../../types/burial';
import type { PersonListItemDto, PersonSex } from '../../types/biography';

const GRAVE_TYPE_OPTIONS = [
  { value: 'SINGLE', label: 'Pojedynczy' },
  { value: 'FAMILY', label: 'Rodzinny' },
  { value: 'EARTH', label: 'Ziemny' },
  { value: 'VAULT', label: 'Murowany / Grobowiec' },
  { value: 'URN', label: 'Urnowy' },
  { value: 'COLUMBARIUM', label: 'Kolumbarium' },
  { value: 'CATACOMB', label: 'Katakumby' },
  { value: 'SYMBOLIC', label: 'Symboliczny' },
  { value: 'MASS', label: 'Zbiorowy' },
  { value: 'OTHER', label: 'Inny' },
];

const formatPolishAge = (age: number | null, approximate: boolean): string | null => {
  if (age === null) return null;
  const prefix = approximate ? 'ok. ' : '';
  if (age === 1) return `${prefix}1 rok`;
  const rem10 = age % 10;
  const rem100 = age % 100;
  if (rem10 >= 2 && rem10 <= 4 && (rem100 < 12 || rem100 > 14)) {
    return `${prefix}${String(age)} lata`;
  }
  return `${prefix}${String(age)} lat`;
};

const formatLifespan = (item: BurialPersonItemDto): string => {
  const b = item.birthYear !== null ? String(item.birthYear) : '?';
  const d = item.deathYear !== null ? String(item.deathYear) : '?';
  const ageStr = formatPolishAge(item.age, item.ageApproximate);
  const base = `${b} – ${d}`;
  return ageStr ? `${base} (${ageStr})` : base;
};

const getBorderClass = (sex: PersonSex | null): string => {
  if (sex === 'MALE') return styles.borderMale;
  if (sex === 'FEMALE') return styles.borderFemale;
  return styles.borderNeutral;
};

export default function GraveDetailsPage() {
  const { graveId } = useParams<{ graveId: string }>();
  const navigate = useNavigate();
  const auth = use(AuthContext);
  const isAdmin =
    auth?.user?.roles.some(r => r.replace(/^ROLE_/, '').toUpperCase() === 'ADMIN') ?? false;

  const [grave, setGrave] = useState<GraveGroupDto | null>(null);
  const [cemeteries, setCemeteries] = useState<CemeteryGroupDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Admin toggle for inspecting GEDCOM placeDescription when grave is assigned to a cemetery
  const [showAdminGedcomPlace, setShowAdminGedcomPlace] = useState<boolean>(false);

  // Admin Edit Grave Form
  const [isEditingGrave, setIsEditingGrave] = useState<boolean>(false);
  const [selectedCemeteryId, setSelectedCemeteryId] = useState<number | null>(null);
  const [section, setSection] = useState<string>('');
  const [sector, setSector] = useState<string>('');
  const [rowNumber, setRowNumber] = useState<string>('');
  const [graveNumber, setGraveNumber] = useState<string>('');
  const [graveType, setGraveType] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [epitaph, setEpitaph] = useState<string>('');

  // Admin Add / Merge Person into Grave
  const [personSearchQuery, setPersonSearchQuery] = useState<string>('');
  const [personSearchResults, setPersonSearchResults] = useState<PersonListItemDto[]>([]);

  const syncEditForm = (data: GraveGroupDto) => {
    setSelectedCemeteryId(data.cemeteryId);
    setSection(data.section ?? '');
    setSector(data.sector ?? '');
    setRowNumber(data.rowNumber ?? '');
    setGraveNumber(data.graveNumber ?? '');
    setGraveType(data.graveType ?? '');
    setDescription(data.description ?? '');
    setEpitaph(data.epitaph ?? '');
  };

  const loadGraveAndCemeteries = async () => {
    if (!graveId) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [graveData, overviewData] = await Promise.all([
        burialApi.getGraveDetails(Number(graveId)),
        burialApi.getBurialsOverview({ includeArchived: true, includeNonCurrent: true }),
      ]);
      setGrave(graveData);
      syncEditForm(graveData);
      setCemeteries(overviewData.cemeteryGroups.filter(g => !g.otherGroup));
    } catch {
      setErrorMessage('Nie udało się pobrać szczegółów nagrobka.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadGraveAndCemeteries();
  }, [graveId]);

  const handleSaveGrave = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!grave) return;
    setErrorMessage(null);
    try {
      const updated = await burialApi.updateGrave(grave.graveId, {
        cemeteryId: selectedCemeteryId,
        section: section.trim() || null,
        sector: sector.trim() || null,
        rowNumber: rowNumber.trim() || null,
        graveNumber: graveNumber.trim() || null,
        graveType: graveType || null,
        description: description.trim() || null,
        epitaph: epitaph.trim() || null,
      });
      setGrave(updated);
      syncEditForm(updated);
      setIsEditingGrave(false);
    } catch {
      setErrorMessage('Nie udało się zapisać zmian w nagrobku.');
    }
  };

  const handleSearchPeople = async () => {
    try {
      const page = await biographyApi.listPeople({
        search: personSearchQuery,
        includeArchived: true,
        page: 0,
        size: 8,
      });
      setPersonSearchResults(page.content);
    } catch {
      setErrorMessage('Nie udało się wyszukać osób.');
    }
  };

  const handleAddPerson = async (personId: number) => {
    if (!grave) return;
    setErrorMessage(null);
    try {
      const updated = await burialApi.addPersonToGrave(grave.graveId, {
        personId,
        current: true,
      });
      setGrave(updated);
      setPersonSearchResults([]);
      setPersonSearchQuery('');
    } catch {
      setErrorMessage('Nie udało się przypisać osoby do tego nagrobka.');
    }
  };

  const handleToggleCurrent = async (burialId: number) => {
    setErrorMessage(null);
    try {
      const updated = await burialApi.toggleBurialCurrent(burialId);
      setGrave(updated);
    } catch {
      setErrorMessage('Nie udało się zmienić statusu aktualności pochówku.');
    }
  };

  const handleSplitPerson = async (burialId: number) => {
    setErrorMessage(null);
    try {
      const updated = await burialApi.splitBurialToNewGrave(burialId);
      setGrave(updated);
    } catch {
      setErrorMessage('Nie udało się wydzielić osoby do osobnego grobu.');
    }
  };

  const handleDeleteGrave = async () => {
    if (!grave) return;
    try {
      await burialApi.deleteGrave(grave.graveId);
      void navigate('/burials');
    } catch {
      setErrorMessage('Nie udało się usunąć nagrobka.');
    }
  };

  if (isLoading) {
    return (
      <div className={styles.pageWrapper}>
        <Loader size={42} />
      </div>
    );
  }

  if (errorMessage && !grave) {
    return (
      <div className={styles.pageWrapper}>
        <div role="alert" className={styles.AlertError}>
          {errorMessage}
        </div>
        <div>
          <Link to="/burials" className={styles.btnSecondary}>
            ← Wróć do cmentarzy i grobów
          </Link>
        </div>
      </div>
    );
  }

  if (!grave) return null;

  const isAssignedToCemetery = grave.cemeteryId !== null;
  const backCemeteryKey = grave.cemeteryId !== null ? String(grave.cemeteryId) : 'OTHER';
  const hasAnyGedcomPlace = grave.burials.some(b => Boolean(b.placeDescription));

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            Nagrobek #{grave.graveId} ({grave.cemeteryName ?? 'Inne'})
          </h1>
          <p className={styles.pageSubtitle}>
            Szczegółowe informacje o lokalizacji nagrobka, epitafium oraz spoczywających w nim osobach.
          </p>
        </div>

        <div className={styles.headerRight}>
          <Link
            to={`/burials?cemetery=${backCemeteryKey}`}
            className={styles.btnSecondary}
          >
            ← Wróć do cmentarza ({grave.cemeteryName ?? 'Inne'})
          </Link>

          {isAdmin && isAssignedToCemetery && hasAnyGedcomPlace && (
            <button
              type="button"
              data-testid="toggle-admin-gedcom-place-button"
              onClick={() => {
                setShowAdminGedcomPlace(prev => !prev);
              }}
              className={styles.btnSecondary}
            >
              {showAdminGedcomPlace
                ? 'Ukryj opis pochówku z GEDCOM'
                : '👁️ Podgląd opisu z GEDCOM'}
            </button>
          )}

          {isAdmin && (
            <>
              <button
                type="button"
                data-testid="edit-grave-button"
                onClick={() => {
                  setIsEditingGrave(prev => !prev);
                }}
                className={styles.btnPrimary}
              >
                {isEditingGrave ? 'Zamknij edycję' : '✏️ Edytuj nagrobek / przypisz cmentarz'}
              </button>
              <button
                type="button"
                data-testid="delete-grave-button"
                onClick={() => {
                  void handleDeleteGrave();
                }}
                className={styles.btnDanger}
              >
                🗑️ Usuń nagrobek
              </button>
            </>
          )}
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className={styles.AlertError}>
          {errorMessage}
        </div>
      )}

      {/* Admin Edit Grave Form */}
      {isAdmin && isEditingGrave && (
        <section className={styles.adminFormCard} data-testid="edit-grave-form">
          <h2 className={styles.cemeteryCardTitle}>
            Edycja parametrów nagrobka i przypisania do cmentarza
          </h2>
          <form
            onSubmit={e => {
              void handleSaveGrave(e);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div className={styles.formGrid}>
              <div className={styles.filterField}>
                <label htmlFor="grave-cemetery-select" className={styles.filterLabel}>
                  Cmentarz
                </label>
                <select
                  id="grave-cemetery-select"
                  data-testid="grave-cemetery-select"
                  value={selectedCemeteryId !== null ? String(selectedCemeteryId) : ''}
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedCemeteryId(val === '' ? null : Number(val));
                  }}
                  className={styles.selectInput}
                >
                  <option value="">Inne (nieprzypisany)</option>
                  {cemeteries.map(c => (
                    <option key={String(c.cemeteryId)} value={String(c.cemeteryId)}>
                      {c.groupName} {c.locationName ? `(${c.locationName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterField}>
                <label htmlFor="grave-type-select" className={styles.filterLabel}>
                  Typ grobu
                </label>
                <select
                  id="grave-type-select"
                  data-testid="grave-type-select"
                  value={graveType}
                  onChange={e => {
                    setGraveType(e.target.value);
                  }}
                  className={styles.selectInput}
                >
                  <option value="">— Nieokreślony —</option>
                  {GRAVE_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterField}>
                <label htmlFor="grave-section-input" className={styles.filterLabel}>
                  Kwatera
                </label>
                <input
                  id="grave-section-input"
                  data-testid="grave-section-input"
                  type="text"
                  value={section}
                  onChange={e => {
                    setSection(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.filterField}>
                <label htmlFor="grave-sector-input" className={styles.filterLabel}>
                  Sektor
                </label>
                <input
                  id="grave-sector-input"
                  type="text"
                  value={sector}
                  onChange={e => {
                    setSector(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.filterField}>
                <label htmlFor="grave-row-input" className={styles.filterLabel}>
                  Rząd
                </label>
                <input
                  id="grave-row-input"
                  type="text"
                  value={rowNumber}
                  onChange={e => {
                    setRowNumber(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.filterField}>
                <label htmlFor="grave-number-input" className={styles.filterLabel}>
                  Numer grobu
                </label>
                <input
                  id="grave-number-input"
                  data-testid="grave-number-input"
                  type="text"
                  value={graveNumber}
                  onChange={e => {
                    setGraveNumber(e.target.value);
                  }}
                  className={styles.textInput}
                />
              </div>
            </div>

            <div className={styles.filterField}>
              <label htmlFor="grave-desc-input" className={styles.filterLabel}>
                Opis lokalizacji / punkty orientacyjne (np. charakterystyczne drzewa, alejka)
              </label>
              <textarea
                id="grave-desc-input"
                data-testid="grave-desc-input"
                value={description}
                onChange={e => {
                  setDescription(e.target.value);
                }}
                className={styles.textareaInput}
              />
            </div>

            <div className={styles.filterField}>
              <label htmlFor="grave-epitaph-input" className={styles.filterLabel}>
                Epitafium na nagrobku
              </label>
              <textarea
                id="grave-epitaph-input"
                data-testid="grave-epitaph-input"
                value={epitaph}
                onChange={e => {
                  setEpitaph(e.target.value);
                }}
                className={styles.textareaInput}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={() => {
                  setIsEditingGrave(false);
                }}
                className={styles.btnSecondary}
              >
                Anuluj
              </button>
              <button
                type="submit"
                data-testid="save-grave-button"
                className={styles.btnPrimary}
              >
                Zapisz nagrobek
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Grave Metadata & Epitaph Display */}
      <section className={styles.adminFormCard}>
        <div className={styles.graveMetadataGrid}>
          <div className={styles.metaBox}>
            <span className={styles.metaBoxLabel}>Cmentarz</span>
            <span className={styles.metaBoxValue}>{grave.cemeteryName ?? 'Inne'}</span>
          </div>
          {grave.graveTypeLabel && (
            <div className={styles.metaBox}>
              <span className={styles.metaBoxLabel}>Typ grobu</span>
              <span className={styles.metaBoxValue}>{grave.graveTypeLabel}</span>
            </div>
          )}
          {grave.section && (
            <div className={styles.metaBox}>
              <span className={styles.metaBoxLabel}>Kwatera</span>
              <span className={styles.metaBoxValue}>{grave.section}</span>
            </div>
          )}
          {grave.sector && (
            <div className={styles.metaBox}>
              <span className={styles.metaBoxLabel}>Sektor</span>
              <span className={styles.metaBoxValue}>{grave.sector}</span>
            </div>
          )}
          {grave.rowNumber && (
            <div className={styles.metaBox}>
              <span className={styles.metaBoxLabel}>Rząd</span>
              <span className={styles.metaBoxValue}>{grave.rowNumber}</span>
            </div>
          )}
          {grave.graveNumber && (
            <div className={styles.metaBox}>
              <span className={styles.metaBoxLabel}>Numer grobu</span>
              <span className={styles.metaBoxValue}>{grave.graveNumber}</span>
            </div>
          )}
        </div>

        {grave.description && (
          <div className={styles.cemeteryDescriptionBanner}>
            <strong>🧭 Jak znaleźć ten grób:</strong> {grave.description}
          </div>
        )}

        {grave.epitaph && (
          <blockquote className={styles.epitaphCard} data-testid="grave-epitaph-box">
            „{grave.epitaph}”
          </blockquote>
        )}
      </section>

      {/* Buried People List */}
      <section className={styles.adminFormCard}>
        <h2 className={styles.cemeteryCardTitle}>
          Pochowane osoby w tym grobie ({grave.burials.length})
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {grave.burials.map(b => {
            const fullName = `${b.surname ?? ''} ${b.givenName ?? ''}`.trim() || '—';
            const showGedcomPlace =
              Boolean(b.placeDescription) && (!isAssignedToCemetery || showAdminGedcomPlace);

            return (
              <div
                key={b.burialId}
                data-testid={`grave-person-row-${String(b.personId)}`}
                className={`${styles.buriedPersonRow} ${getBorderClass(b.sex)}`}
              >
                <div className={styles.personIdentity}>
                  <PersonAvatar sex={b.sex} size="md" />
                  <div>
                    <div className={styles.personName}>{fullName}</div>
                    <div className={styles.personLifespan}>{formatLifespan(b)}</div>
                    <div className={styles.badgesRow}>
                      {!b.current && (
                        <span className={styles.nonCurrentBadge}>
                          Nieaktualne miejsce pochówku
                        </span>
                      )}
                      {b.archived && (
                        <span className={styles.archivedBadge}>Zarchiwizowana</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.detailsBox}>
                  {showGedcomPlace && (
                    <div className={styles.detailLine}>
                      <span className={styles.detailLabel}>Opis z GEDCOM:</span>
                      <span className={styles.detailValue}>{b.placeDescription}</span>
                    </div>
                  )}
                  {b.burialDateText && (
                    <div className={styles.detailLine}>
                      <span className={styles.detailLabel}>Data pochówku:</span>
                      <span className={styles.detailValue}>{b.burialDateText}</span>
                    </div>
                  )}
                  {(b.birthDateText ?? b.birthPlace) && (
                    <div className={styles.detailLine}>
                      <span className={styles.detailLabel}>Urodzenie:</span>
                      <span className={styles.detailValue}>
                        {b.birthDateText ?? ''} {b.birthPlace ? `(${b.birthPlace})` : ''}
                      </span>
                    </div>
                  )}
                  {(b.deathDateText ?? b.deathPlace) && (
                    <div className={styles.detailLine}>
                      <span className={styles.detailLabel}>Śmierć:</span>
                      <span className={styles.detailValue}>
                        {b.deathDateText ?? ''} {b.deathPlace ? `(${b.deathPlace})` : ''}
                      </span>
                    </div>
                  )}
                  {b.causeOfDeath && (
                    <div className={styles.detailLine}>
                      <span className={styles.detailLabel}>Przyczyna śmierci:</span>
                      <span className={styles.detailValue}>{b.causeOfDeath}</span>
                    </div>
                  )}
                </div>

                <div className={styles.cardActions}>
                  <Link
                    to={`/biographies/${String(b.personId)}`}
                    className={styles.actionLink}
                  >
                    📖 Biografia
                  </Link>
                  <Link
                    to={`/tree?personId=${String(b.personId)}`}
                    className={styles.actionLink}
                  >
                    🌳 Drzewo
                  </Link>

                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        data-testid={`toggle-current-burial-${String(b.burialId)}`}
                        onClick={() => {
                          void handleToggleCurrent(b.burialId);
                        }}
                        className={styles.actionLink}
                      >
                        {b.current ? 'Oznacz jako nieaktualne' : 'Oznacz jako aktualne'}
                      </button>

                      {grave.burials.length > 1 && (
                        <button
                          type="button"
                          data-testid={`split-burial-${String(b.burialId)}`}
                          onClick={() => {
                            void handleSplitPerson(b.burialId);
                          }}
                          className={styles.actionLink}
                        >
                          ↗ Wydziel do osobnego grobu
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Admin Section: Merge / Add another person to this grave */}
        {isAdmin && (
          <div style={{ marginTop: '0.75rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
            <div className={styles.filterLabel} style={{ marginBottom: '0.5rem' }}>
              Połącz grób / dodaj kolejną osobę do tego nagrobka
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                data-testid="merge-person-search-input"
                placeholder="Wpisz nazwisko lub imię osoby..."
                value={personSearchQuery}
                onChange={e => {
                  setPersonSearchQuery(e.target.value);
                }}
                className={styles.textInput}
                style={{ flex: 1, minWidth: '220px' }}
              />
              <button
                type="button"
                data-testid="merge-person-search-button"
                onClick={() => {
                  void handleSearchPeople();
                }}
                className={styles.btnSecondary}
              >
                Szukaj osoby
              </button>
            </div>

            {personSearchResults.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                {personSearchResults.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`add-person-to-grave-${String(p.id)}`}
                    onClick={() => {
                      void handleAddPerson(p.id);
                    }}
                    className={styles.btnSecondary}
                  >
                    + Dodaj do tego grobu: {p.surname} {p.givenName} ({p.birthYear ?? '?'}–
                    {p.deathYear ?? '?'})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}