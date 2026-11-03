import { useState, useEffect, useId, use, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { biographyApi } from '../../api/biographyApi';
import { mediaApi } from '../../api/mediaApi';
import { AuthContext } from '../../context/AuthContext';
import AncestorTree from '../../components/AncestorTree/AncestorTree';
import WikiBiographySection from '../../components/WikiBiography/WikiBiographySection';
import Loader from '../../components/Loader/Loader';
import PersonAvatar from '../../components/PersonAvatar/PersonAvatar';
import InteractiveAvatarCropper from '../../components/PersonAvatar/InteractiveAvatarCropper';
import styles from './Biographies.module.css';
import type {
  ChildInFamilyDto,
  FamilyChildRelationshipType,
  LifeState,
  PersonBiographyDto,
  PersonSex,
  RelatedPersonDto,
} from '../../types/biography';
import type { MediaItemDto, MediaCollectionDto } from '../../types/media';

const translateSex = (sex: PersonSex | null): string | null => {
  if (sex === 'MALE') return 'mężczyzna';
  if (sex === 'FEMALE') return 'kobieta';
  if (sex === 'INTERSEX') return 'interpłciowość';
  return null;
};

const translateLifeState = (state: LifeState | null, sex: PersonSex | null): string => {
  if (state === 'DECEASED') {
    return sex === 'FEMALE' ? 'zmarła' : 'zmarły';
  }
  if (state === 'LIVING') {
    return sex === 'FEMALE' ? 'żyjąca' : 'żyjący';
  }
  return 'los nieznany';
};

const translateRelationshipLabel = (type: FamilyChildRelationshipType): string => {
  switch (type) {
    case 'BIOLOGICAL':
      return 'biologiczna';
    case 'ADOPTED':
      return 'adopcja';
    case 'FOSTER':
      return 'rodzina przybrana / zastępcza';
    case 'OTHER':
      return 'inna relacja';
  }
};

const translateFamilyStatus = (code: string | null): string | null => {
  switch (code) {
    case 'MARRIED':
      return 'Małżeństwo';
    case 'DIVORCED':
      return 'Rozwód';
    case 'SEPARATED':
      return 'Separacja';
    case 'WIDOWED':
      return 'Wdowieństwo';
    case 'ENGAGED':
      return 'Zaręczyny';
    case 'PARTNERS':
      return 'Związek partnerski';
    case 'FRIENDS':
      return 'Przyjaciele';
    case 'ANNULLED':
      return 'Unieważnione małżeństwo';
    default:
      return null;
  }
};

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

const formatHeaderYears = (bio: PersonBiographyDto): string => {
  if (bio.birthYear !== null && bio.deathYear !== null) {
    return `(${String(bio.birthYear)}–${String(bio.deathYear)})`;
  }
  if (bio.birthYear !== null) {
    return `(ur. ${String(bio.birthYear)})`;
  }
  if (bio.deathYear !== null) {
    return `(zm. ${String(bio.deathYear)})`;
  }
  return '';
};

const renderInfoboxRow = (label: string, value: ReactNode) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return (
    <tr key={label} className={styles.infoboxRow}>
      <th scope="row" className={styles.infoboxTh}>
        {label}
      </th>
      <td className={styles.infoboxTd}>{value}</td>
    </tr>
  );
};

const renderInlineRelative = (rel: RelatedPersonDto, note?: string) => {
  const fullName = `${rel.givenName ?? ''} ${rel.surname ?? ''}`.trim();
  const years =
    !rel.privateRecord && (rel.birthYear !== null || rel.deathYear !== null)
      ? `${rel.birthYear !== null ? String(rel.birthYear) : '?'}–${
          rel.deathYear !== null ? String(rel.deathYear) : ''
        }`
      : null;

  const subText = [years, note].filter(Boolean).join(' • ');

  const inner = (
    <>
      <PersonAvatar
        sex={rel.sex}
        size="sm"
        avatarMediaId={rel.avatarMediaId}
        avatarMediaType={rel.avatarMediaType}
        avatarCropX={rel.avatarCropX}
        avatarCropY={rel.avatarCropY}
        avatarCropZoom={rel.avatarCropZoom}
      />
      <div className={styles.infoboxRelativeText}>
        <span className={styles.infoboxRelativeName}>{fullName}</span>
        {subText && <span className={styles.infoboxRelativeSub}>{subText}</span>}
      </div>
    </>
  );

  if (rel.privateRecord || rel.id === null) {
    return (
      <div
        key={`priv-${fullName}-${note ?? ''}`}
        className={`${styles.infoboxRelativeItem} ${styles.infoboxRelativePrivate}`}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      key={`${String(rel.id)}-${note ?? ''}`}
      to={`/biographies/${String(rel.id)}`}
      className={`${styles.infoboxRelativeItem} ${styles.infoboxRelativeLink}`}
    >
      {inner}
    </Link>
  );
};

const describeNonBiologicalChildRelation = (ch: ChildInFamilyDto): string => {
  const f = ch.fatherRelationshipType;
  const m = ch.motherRelationshipType;
  if (f === m) {
    return translateRelationshipLabel(f);
  }
  return `ojciec: ${translateRelationshipLabel(f)}, matka: ${translateRelationshipLabel(m)}`;
};

export default function PersonBiographyPage() {
  const portraitInputId = useId();
  const { personId } = useParams<{ personId: string }>();
  const auth = use(AuthContext);
  const isAdmin =
    auth?.user?.roles.some(r => r.replace(/^ROLE_/, '').toUpperCase() === 'ADMIN') ?? false;

  const [bio, setBio] = useState<PersonBiographyDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRawGedcom, setShowRawGedcom] = useState<boolean>(false);
  const [isPortraitFullscreen, setIsPortraitFullscreen] = useState<boolean>(false);
  const [portraitZoom, setPortraitZoom] = useState<number>(1);

  // Admin Infobox Portrait Picker & Cropper Modal State
  const [showPortraitModal, setShowPortraitModal] = useState<boolean>(false);
  const [showCropperModal, setShowCropperModal] = useState<boolean>(false);
  const [portraitUploadFile, setPortraitUploadFile] = useState<File | null>(null);
  const [portraitSearchQuery, setPortraitSearchQuery] = useState<string>('');
  const [portraitCandidates, setPortraitCandidates] = useState<MediaItemDto[]>([]);
  const [availableCollections, setAvailableCollections] = useState<MediaCollectionDto[]>([]);
  const [selectedPortraitCollectionId, setSelectedPortraitCollectionId] = useState<number | null>(null);
  const [isSubmittingPortrait, setIsSubmittingPortrait] = useState<boolean>(false);

  const fetchBio = async () => {
    if (!personId) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await biographyApi.getBiography(Number(personId));
      setBio(result);
    } catch {
      setErrorMessage(
        'Nie udało się pobrać biografii osoby lub brak uprawnień do jej wyświetlenia.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchBio();
  }, [personId]);

  const fetchGalleryPortraitCandidates = async (q: string) => {
    try {
      const page = await mediaApi.getGalleryPage({
        search: q,
        page: 0,
        size: 36,
      });
      setPortraitCandidates(page.content);
    } catch {
      // Ignore error
    }
  };

  const handleOpenPortraitModal = () => {
    setPortraitUploadFile(null);
    setPortraitSearchQuery('');
    setShowPortraitModal(true);
    void fetchGalleryPortraitCandidates('');
    void (async () => {
      try {
        const cols = await mediaApi.getAllCollections();
        setAvailableCollections(cols);
        if (cols.length > 0 && selectedPortraitCollectionId === null) {
          const firstCol = cols.at(0);
          if (firstCol) {
            setSelectedPortraitCollectionId(firstCol.id);
          }
        }
      } catch {
        // Ignore error
      }
    })();
  };

  const handleUploadNewPortrait = async () => {
    if (!bio || !portraitUploadFile) return;
    if (!selectedPortraitCollectionId) {
      setErrorMessage('Wybierz istniejącą kolekcję dla wgrywanego portretu.');
      return;
    }
    setIsSubmittingPortrait(true);
    try {
      await mediaApi.uploadMedia({
        file: portraitUploadFile,
        primaryContext: 'PERSON',
        personIds: [bio.id],
        collectionId: selectedPortraitCollectionId,
        setAsPersonAvatar: true,
        clientLastModifiedMs: portraitUploadFile.lastModified || undefined,
      });
      setShowPortraitModal(false);
      await fetchBio();
      setShowCropperModal(true);
    } catch {
      setErrorMessage('Nie udało się wgrać nowego portretu.');
    } finally {
      setIsSubmittingPortrait(false);
    }
  };

  const handleSelectExistingAsPortrait = async (mediaId: number) => {
    if (!bio) return;
    setIsSubmittingPortrait(true);
    try {
      await mediaApi.linkExistingMedia({
        mediaIds: [mediaId],
        personId: bio.id,
      });
      await mediaApi.updateMedia(mediaId, {
        setAsAvatarForPersonId: bio.id,
        avatarCropX: 50,
        avatarCropY: 50,
        avatarCropZoom: 1.0,
      });
      setShowPortraitModal(false);
      await fetchBio();
      setShowCropperModal(true);
    } catch {
      setErrorMessage('Nie udało się ustawić wybranego zdjęcia jako portretu.');
    } finally {
      setIsSubmittingPortrait(false);
    }
  };

  const handleSaveAvatarCrop = async (cropX: number, cropY: number, cropZoom: number) => {
    if (!bio?.avatarMediaId) return;
    try {
      await mediaApi.updateMedia(bio.avatarMediaId, {
        setAsAvatarForPersonId: bio.id,
        avatarCropX: cropX,
        avatarCropY: cropY,
        avatarCropZoom: cropZoom,
      });
      setShowCropperModal(false);
      await fetchBio();
    } catch {
      setErrorMessage('Nie udało się zapisać wykadrowanego awatara.');
    }
  };

  const handleRemoveAvatar = async () => {
    if (!bio?.avatarMediaId) return;
    const confirmed = window.confirm(
      'Czy na pewno chcesz usunąć portret z profilu tej osoby? Plik multimedialny nadal pozostanie w galerii.'
    );
    if (!confirmed) return;

    setIsSubmittingPortrait(true);
    try {
      await biographyApi.removeAvatar(bio.id);
      setShowPortraitModal(false);
      setShowCropperModal(false);
      await fetchBio();
    } catch {
      setErrorMessage('Nie udało się usunąć portretu z profilu.');
    } finally {
      setIsSubmittingPortrait(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.pageWrapper}>
        <Loader size={42} />
      </div>
    );
  }

  if (errorMessage || !bio) {
    return (
      <div className={styles.pageWrapper}>
        <div role="alert" className={styles.AlertError}>
          {errorMessage ?? 'Nie znaleziono osoby.'}
        </div>
        <div>
          <Link to="/biographies" className={styles.btnSecondary}>
            ← Wróć do listy biografii
          </Link>
        </div>
      </div>
    );
  }

  const fullName = `${bio.givenName ?? ''} ${bio.surname ?? ''}`.trim();
  const headerYears = formatHeaderYears(bio);
  const ageStr = formatPolishAge(bio.age, bio.ageApproximate);
  const stateStr = translateLifeState(bio.lifeState, bio.sex);
  const ageAndStatusText = ageStr ? `${ageStr} (${stateStr})` : stateStr;

  const birthNameRecord = bio.names.find(n => n.type === 'BIRTH');
  const birthFullName = birthNameRecord
    ? `${birthNameRecord.givenName ?? ''} ${birthNameRecord.surname ?? ''}`.trim()
    : null;

  const biologicalFathers: RelatedPersonDto[] = [];
  const biologicalMothers: RelatedPersonDto[] = [];
  const nonBiologicalParents: { person: RelatedPersonDto; note: string }[] = [];
  const allSiblings: RelatedPersonDto[] = [];
  const seenSiblingIds = new Set<number>();

  for (const fam of bio.originFamilies) {
    if (fam.father) {
      if (fam.fatherRelationshipType === 'BIOLOGICAL') {
        biologicalFathers.push(fam.father);
      } else {
        nonBiologicalParents.push({
          person: fam.father,
          note: `ojciec – ${translateRelationshipLabel(fam.fatherRelationshipType)}`,
        });
      }
    }
    if (fam.mother) {
      if (fam.motherRelationshipType === 'BIOLOGICAL') {
        biologicalMothers.push(fam.mother);
      } else {
        nonBiologicalParents.push({
          person: fam.mother,
          note: `matka – ${translateRelationshipLabel(fam.motherRelationshipType)}`,
        });
      }
    }
    for (const sib of fam.siblings) {
      if (sib.id !== null) {
        if (!seenSiblingIds.has(sib.id)) {
          seenSiblingIds.add(sib.id);
          allSiblings.push(sib);
        }
      } else {
        allSiblings.push(sib);
      }
    }
  }

  const hasOriginSection =
    biologicalFathers.length > 0 ||
    biologicalMothers.length > 0 ||
    nonBiologicalParents.length > 0 ||
    allSiblings.length > 0;

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.topNavBar}>
        <Link to="/biographies" className={styles.btnSecondary}>
          ← Wróć do listy biografii
        </Link>

        {bio.rawGedcomData && (
          <button
            type="button"
            data-testid="toggle-raw-gedcom-button"
            onClick={() => {
              setShowRawGedcom(prev => !prev);
            }}
            className={styles.btnSecondary}
          >
            {showRawGedcom ? 'Ukryj dane surowe GEDCOM' : 'Podgląd surowych danych GEDCOM'}
          </button>
        )}
      </div>

      <div className={styles.wikiGrid}>
        {/* 1. TITLE HEADER */}
        <header className={styles.articleHeaderBlock}>
          <h1 className={styles.articleMainTitle}>
            {fullName}
            {headerYears && <span className={styles.articleLifespan}>{headerYears}</span>}
          </h1>
        </header>

        {/* 2. ANCESTOR TREE */}
        <section className={`${styles.wikiSection} ${styles.articleTreeBlock}`}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <h2
              className={styles.wikiSectionTitle}
              style={{ borderBottom: 'none', paddingBottom: 0 }}
            >
              Drzewo przodków
            </h2>
            <Link
              to={`/tree?personId=${String(bio.id)}`}
              className={styles.btnSecondary}
            >
              🌳 Otwórz w pełnym drzewie →
            </Link>
          </div>
          <AncestorTree rootPersonId={bio.id} mode="biography" />
        </section>

        {/* 3. UNIFIED RIGHT-HAND INFOBOX TABLE */}
        <aside className={styles.infobox}>
          <div className={styles.infoboxTitleBanner}>{fullName}</div>

          <div className={styles.infoboxAvatarArea}>
            {bio.avatarMediaId ? (
              <button
                type="button"
                data-testid="infobox-portrait-fullscreen-trigger"
                title="Kliknij, aby otworzyć na pełnym ekranie i powiększyć"
                onClick={() => {
                  setPortraitZoom(1);
                  setIsPortraitFullscreen(true);
                }}
                className={styles.infoboxPortraitButton}
              >
                {bio.avatarMediaType === 'VIDEO' ? (
                  <video
                    src={mediaApi.getFileUrl(bio.avatarMediaId)}
                    autoPlay
                    loop
                    muted
                    playsInline
                    disablePictureInPicture
                    className={styles.infoboxPortraitMedia}
                  />
                ) : (
                  <img
                    src={mediaApi.getFileUrl(bio.avatarMediaId)}
                    alt={fullName}
                    className={styles.infoboxPortraitMedia}
                  />
                )}
              </button>
            ) : (
              <PersonAvatar sex={bio.sex} size="xl" />
            )}

            {bio.archived && <span className={styles.archivedBadge}>Osoba zarchiwizowana</span>}

            {isAdmin && (
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  data-testid="open-infobox-portrait-modal-button"
                  onClick={handleOpenPortraitModal}
                  className={styles.btnSecondary}
                  style={{ padding: '0.32rem 0.7rem', fontSize: '0.78rem' }}
                >
                  📷 {bio.avatarMediaId ? 'Zmień portret' : 'Ustaw portret'}
                </button>
                {bio.avatarMediaId && (
                  <>
                    <button
                      type="button"
                      data-testid="open-infobox-cropper-button"
                      onClick={() => {
                        setShowCropperModal(true);
                      }}
                      className={styles.btnSecondary}
                      style={{ padding: '0.32rem 0.7rem', fontSize: '0.78rem' }}
                    >
                      ✂️ Wykadruj kółko
                    </button>
                    <button
                      type="button"
                      data-testid="remove-infobox-portrait-button"
                      onClick={() => {
                        void handleRemoveAvatar();
                      }}
                      className={styles.btnSecondary}
                      style={{ padding: '0.32rem 0.7rem', fontSize: '0.78rem', color: '#b91c1c' }}
                      title="Usuń portret z profilu"
                    >
                      🗑️ Usuń portret
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className={styles.infoboxSectionHeader}>Podstawowe informacje</div>
          <table className={styles.infoboxTable}>
            <tbody>
              {renderInfoboxRow('Imię i nazwisko', fullName)}
              {birthFullName &&
                birthFullName !== fullName &&
                renderInfoboxRow('Imię i nazwisko rodowe', birthFullName)}
              {renderInfoboxRow('Płeć', translateSex(bio.sex))}
            </tbody>
          </table>

          <div className={styles.infoboxSectionHeader}>Urodzenie i śmierć</div>
          <table className={styles.infoboxTable}>
            <tbody>
              {renderInfoboxRow(
                bio.age !== null ? 'Wiek' : 'Status',
                ageAndStatusText
              )}
              {renderInfoboxRow('Data urodzenia', bio.birthDateText)}
              {renderInfoboxRow('Miejsce urodzenia', bio.birthPlace)}
              {bio.lifeState === 'DECEASED' && (
                <>
                  {renderInfoboxRow('Data śmierci', bio.deathDateText)}
                  {renderInfoboxRow('Miejsce śmierci', bio.deathPlace)}
                  {renderInfoboxRow('Przyczyna śmierci', bio.causeOfDeath)}
                  {renderInfoboxRow(
                    'Miejsce pochówku',
                    bio.burialPlace ? (
                      bio.burialGraveId ? (
                        <Link
                          to={`/burials/graves/${String(bio.burialGraveId)}`}
                          style={{ color: '#1d4ed8', fontWeight: 700, textDecoration: 'underline' }}
                        >
                          {bio.burialPlace}
                        </Link>
                      ) : (
                        bio.burialPlace
                      )
                    ) : null
                  )}
                </>
              )}
            </tbody>
          </table>

          {hasOriginSection && (
            <>
              <div className={styles.infoboxSectionHeader}>Rodzina pochodzenia</div>
              <table className={styles.infoboxTable}>
                <tbody>
                  {biologicalMothers.length > 0 &&
                    renderInfoboxRow(
                      'Matka',
                      <div className={styles.infoboxRelativesList}>
                        {biologicalMothers.map(m => renderInlineRelative(m))}
                      </div>
                    )}
                  {biologicalFathers.length > 0 &&
                    renderInfoboxRow(
                      'Ojciec',
                      <div className={styles.infoboxRelativesList}>
                        {biologicalFathers.map(f => renderInlineRelative(f))}
                      </div>
                    )}
                  {nonBiologicalParents.length > 0 &&
                    renderInfoboxRow(
                      'Rodzice adopcyjni / przybrani',
                      <div className={styles.infoboxRelativesList}>
                        {nonBiologicalParents.map(item =>
                          renderInlineRelative(item.person, item.note)
                        )}
                      </div>
                    )}
                  {allSiblings.length > 0 &&
                    renderInfoboxRow(
                      'Rodzeństwo',
                      <div className={styles.infoboxRelativesList}>
                        {allSiblings.map(sib => renderInlineRelative(sib))}
                      </div>
                    )}
                </tbody>
              </table>
            </>
          )}

          {bio.spouseFamilies.map((fam, idx) => {
            const sectionTitle =
              bio.spouseFamilies.length > 1
                ? `Związek (${String(idx + 1)})`
                : 'Związek';

            const spouseFullName = fam.spouse
              ? `${fam.spouse.givenName ?? ''} ${fam.spouse.surname ?? ''}`.trim()
              : null;

            const biologicalChildren = fam.children.filter(
              ch =>
                ch.fatherRelationshipType === 'BIOLOGICAL' &&
                ch.motherRelationshipType === 'BIOLOGICAL'
            );
            const nonBiologicalChildren = fam.children.filter(
              ch =>
                ch.fatherRelationshipType !== 'BIOLOGICAL' ||
                ch.motherRelationshipType !== 'BIOLOGICAL'
            );

            const childrenLabel = spouseFullName
              ? `Dzieci (${spouseFullName})`
              : 'Dzieci';
            const adoptedChildrenLabel = spouseFullName
              ? `Dzieci adopcyjne / przybrane (${spouseFullName})`
              : 'Dzieci adopcyjne / przybrane';

            return (
              <div key={fam.familyId}>
                <div className={styles.infoboxSectionHeader}>{sectionTitle}</div>
                <table className={styles.infoboxTable}>
                  <tbody>
                    {renderInfoboxRow('Status', translateFamilyStatus(fam.statusCode))}
                    {fam.spouse &&
                      renderInfoboxRow(
                        'Małżonek / partner',
                        <div className={styles.infoboxRelativesList}>
                          {renderInlineRelative(fam.spouse)}
                        </div>
                      )}
                    {renderInfoboxRow('Data ślubu', fam.weddingDateText)}
                    {renderInfoboxRow('Miejsce ślubu', fam.weddingPlace)}
                    {biologicalChildren.length > 0 &&
                      renderInfoboxRow(
                        childrenLabel,
                        <div className={styles.infoboxRelativesList}>
                          {biologicalChildren.map(ch => renderInlineRelative(ch.person))}
                        </div>
                      )}
                    {nonBiologicalChildren.length > 0 &&
                      renderInfoboxRow(
                        adoptedChildrenLabel,
                        <div className={styles.infoboxRelativesList}>
                          {nonBiologicalChildren.map(ch =>
                            renderInlineRelative(
                              ch.person,
                              describeNonBiologicalChildRelation(ch)
                            )
                          )}
                        </div>
                      )}
                  </tbody>
                </table>
              </div>
            );
          })}
        </aside>

        {/* 4. LEFT MAIN CONTENT (Wikipedia-Style Biography with Embedded Photos/Videos) */}
        <div className={styles.articleBodyBlock}>
          {showRawGedcom && bio.rawGedcomData && (
            <section className={styles.wikiSection} data-testid="raw-gedcom-panel">
              <h2 className={styles.wikiSectionTitle}>
                Surowe dane z ostatniego importu GEDCOM (widok administratora)
              </h2>
              <table className={styles.infoboxTable}>
                <tbody>
                  {renderInfoboxRow('Identyfikator XREF w pliku', bio.rawGedcomData.gedRefId)}
                  {renderInfoboxRow('Ostatni zapisany _UID', bio.rawGedcomData.gedUid)}
                  {renderInfoboxRow(
                    'Surowe imię i nazwisko',
                    `${bio.rawGedcomData.rawGivenName ?? '—'} /${
                      bio.rawGedcomData.rawSurname ?? '—'
                    }/`
                  )}
                  {renderInfoboxRow('Surowa data urodzenia', bio.rawGedcomData.rawBirthDate)}
                  {renderInfoboxRow('Surowe miejsce urodzenia', bio.rawGedcomData.rawBirthPlace)}
                  {renderInfoboxRow('Surowa data śmierci', bio.rawGedcomData.rawDeathDate)}
                  {renderInfoboxRow('Surowe miejsce śmierci', bio.rawGedcomData.rawDeathPlace)}
                  {renderInfoboxRow(
                    'Surowa przyczyna śmierci',
                    bio.rawGedcomData.rawCauseOfDeath
                  )}
                  {renderInfoboxRow(
                    'Surowe miejsce pochówku',
                    bio.rawGedcomData.rawBurialPlace
                  )}
                  {bio.rawGedcomData.externalIds.length > 0 &&
                    renderInfoboxRow(
                      'Zewnętrzne identyfikatory (_UID)',
                      bio.rawGedcomData.externalIds
                        .map(e => `${e.sourceSystem}: ${e.uidValue}`)
                        .join(', ')
                    )}
                </tbody>
              </table>
            </section>
          )}

          <WikiBiographySection
            personId={bio.id}
            biographyContent={bio.biographyContent}
            isAdmin={isAdmin}
            onBiographyUpdated={updated => {
              setBio(updated);
            }}
          />
        </div>
      </div>

      {/* Modal: Set or Change Main Portrait (Upload New or Pick from Gallery) */}
      {isAdmin && showPortraitModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            zIndex: 1250,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => {
            setShowPortraitModal(false);
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              width: '100%',
              maxWidth: '820px',
              maxHeight: '88vh',
              overflowY: 'auto',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '1.08rem', color: '#0f172a' }}>
                📷 Ustaw lub zmień portret główny osoby: {fullName}
              </strong>
              <button
                type="button"
                onClick={() => {
                  setShowPortraitModal(false);
                }}
                className={styles.btnSecondary}
              >
                ✕ Zamknij
              </button>
            </div>

            {bio.avatarMediaId && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '0.84rem', color: '#991b1b', fontWeight: 500 }}>
                  Ta osoba ma obecnie ustawiony portret. Możesz go usunąć z profilu (plik pozostanie nienaruszony w galerii).
                </span>
                <button
                  type="button"
                  disabled={isSubmittingPortrait}
                  onClick={() => {
                    void handleRemoveAvatar();
                  }}
                  className={styles.btnSecondary}
                  style={{
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    borderColor: '#b91c1c',
                    fontSize: '0.82rem',
                    flexShrink: 0,
                  }}
                >
                  🗑️ Usuń portret z profilu
                </button>
              </div>
            )}

            {/* Option 1: Upload from disk */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '0.9rem 1.1rem',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <label
                  htmlFor={portraitInputId}
                  className={styles.btnSecondary}
                  style={{ cursor: 'pointer' }}
                >
                  📂 Wybierz nowy plik portretu z dysku
                </label>
                <input
                  id={portraitInputId}
                  type="file"
                  accept="image/*,video/*"
                  onChange={e => {
                    setPortraitUploadFile(e.target.files?.[0] ?? null);
                  }}
                  style={{ display: 'none' }}
                />
                <span style={{ fontSize: '0.84rem', color: '#475569', fontWeight: 600 }}>
                  {portraitUploadFile ? portraitUploadFile.name : 'Nie wybrano pliku'}
                </span>
              </div>

              {availableCollections.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
                  <label htmlFor="portrait-col-select" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    Kolekcja docelowa:
                  </label>
                  <select
                    id="portrait-col-select"
                    value={selectedPortraitCollectionId ?? ''}
                    onChange={e => {
                      setSelectedPortraitCollectionId(e.target.value ? Number(e.target.value) : null);
                    }}
                    className={styles.selectInput}
                    style={{ flex: 1, maxWidth: '300px' }}
                  >
                    <option value="">-- Wybierz kolekcję --</option>
                    {availableCollections.map(col => (
                      <option key={col.id} value={col.id}>
                        📁 {col.name} {col.datedCollection ? `(${String(col.startYear ?? '')})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                disabled={!portraitUploadFile || isSubmittingPortrait}
                onClick={() => {
                  void handleUploadNewPortrait();
                }}
                className={styles.btnSecondary}
                style={{ backgroundColor: '#2563eb', color: '#ffffff', borderColor: '#1d4ed8' }}
              >
                {isSubmittingPortrait ? 'Wgrywanie...' : 'Wgraj i ustaw jako portret'}
              </button>
            </div>

            {/* Option 2: Pick existing from Gallery */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>
                Lub wybierz istniejące zdjęcie / film z galerii:
              </strong>
              <input
                type="text"
                placeholder="Szukaj w galerii po tytule, nazwie pliku lub osobie..."
                value={portraitSearchQuery}
                onChange={e => {
                  const q = e.target.value;
                  setPortraitSearchQuery(q);
                  void fetchGalleryPortraitCandidates(q);
                }}
                className={styles.textInput}
              />

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))',
                  gap: '0.75rem',
                  maxHeight: '360px',
                  overflowY: 'auto',
                }}
              >
                {portraitCandidates.map(cand => (
                  <button
                    key={cand.id}
                    type="button"
                    disabled={isSubmittingPortrait}
                    onClick={() => {
                      void handleSelectExistingAsPortrait(cand.id);
                    }}
                    style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ width: '100%', height: '120px', backgroundColor: '#0f172a' }}>
                      {cand.mediaType === 'IMAGE' ? (
                        <img
                          src={mediaApi.getThumbnailUrl(cand.id)}
                          alt={cand.title ?? ''}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <video
                          src={`${mediaApi.getFileUrl(cand.id)}#t=0.5`}
                          preload="metadata"
                          muted
                          playsInline
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      )}
                    </div>
                    <div
                      style={{
                        padding: '0.4rem 0.55rem',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        color: '#0f172a',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {cand.title ?? cand.fileName}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Interactive Circular Avatar Cropper */}
      {isAdmin && showCropperModal && bio.avatarMediaId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            zIndex: 1260,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => {
            setShowCropperModal(false);
          }}
        >
          <div
            style={{ width: '100%', maxWidth: '640px' }}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <InteractiveAvatarCropper
              mediaId={bio.avatarMediaId}
              mediaType={bio.avatarMediaType ?? 'IMAGE'}
              initialCropX={bio.avatarCropX}
              initialCropY={bio.avatarCropY}
              initialCropZoom={bio.avatarCropZoom}
              onSaveCrop={(cx, cy, cz) => {
                void handleSaveAvatarCrop(cx, cy, cz);
              }}
              onCancel={() => {
                setShowCropperModal(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Fullscreen Infobox Portrait Preview */}
      {isPortraitFullscreen && bio.avatarMediaId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(5, 8, 15, 0.96)',
            zIndex: 1300,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => {
            setIsPortraitFullscreen(false);
          }}
          onWheel={e => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.25 : -0.25;
            setPortraitZoom(prev => Math.min(5, Math.max(1, prev + delta)));
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              display: 'flex',
              gap: '0.5rem',
              zIndex: 10,
            }}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <button
              type="button"
              onClick={() => {
                setPortraitZoom(prev => Math.max(1, prev - 0.5));
              }}
              className={styles.btnSecondary}
            >
              −
            </button>
            <button
              type="button"
              onClick={() => {
                setPortraitZoom(1);
              }}
              className={styles.btnSecondary}
            >
              {Math.round(portraitZoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => {
                setPortraitZoom(prev => Math.min(5, prev + 0.5));
              }}
              className={styles.btnSecondary}
            >
              +
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPortraitFullscreen(false);
              }}
              className={styles.btnSecondary}
            >
              ✕ Zamknij
            </button>
          </div>

          <div
            onClick={e => {
              e.stopPropagation();
            }}
            style={{
              transform: `scale(${String(portraitZoom)})`,
              transition: 'transform 0.1s ease-out',
              maxWidth: '94vw',
              maxHeight: '88vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {bio.avatarMediaType === 'VIDEO' ? (
              <video
                src={mediaApi.getFileUrl(bio.avatarMediaId)}
                autoPlay
                loop
                muted
                playsInline
                style={{ maxWidth: '94vw', maxHeight: '88vh', objectFit: 'contain' }}
              />
            ) : (
              <img
                src={mediaApi.getFileUrl(bio.avatarMediaId)}
                alt={fullName}
                style={{ maxWidth: '94vw', maxHeight: '88vh', objectFit: 'contain' }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}