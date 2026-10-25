import { useState, useEffect, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { biographyApi } from '../../api/biographyApi';
import Loader from '../../components/Loader/Loader';
import PersonAvatar from '../../components/PersonAvatar/PersonAvatar';
import styles from './Biographies.module.css';
import AncestorTree from '../../components/AncestorTree/AncestorTree';
import type {
  ChildInFamilyDto,
  FamilyChildRelationshipType,
  LifeState,
  PersonBiographyDto,
  PersonSex,
  RelatedPersonDto,
} from '../../types/biography';

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
      <PersonAvatar sex={rel.sex} size="sm" />
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
  const { personId } = useParams<{ personId: string }>();
  const [bio, setBio] = useState<PersonBiographyDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRawGedcom, setShowRawGedcom] = useState<boolean>(false);

  useEffect(() => {
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
    void fetchBio();
  }, [personId]);

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

  // Separate biological parents, adoptive/foster parents, and siblings across originFamilies
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
      {/* Top Action Bar */}
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

      {/* Wikipedia-Style Grid:
          Desktop: Left (Header + Content), Right (Infobox)
          Mobile: 1. Header -> 2. Infobox -> 3. Content */}
      <div className={styles.wikiGrid}>
        {/* 1. TITLE HEADER */}
        <header className={styles.articleHeaderBlock}>
          <h1 className={styles.articleMainTitle}>
            {fullName}
            {headerYears && <span className={styles.articleLifespan}>{headerYears}</span>}
          </h1>
        </header>

        {/* 2. UNIFIED RIGHT-HAND INFOBOX TABLE */}
        <aside className={styles.infobox}>
          <div className={styles.infoboxTitleBanner}>{fullName}</div>

          <div className={styles.infoboxAvatarArea}>
            <PersonAvatar sex={bio.sex} size="xl" />
            {bio.archived && <span className={styles.archivedBadge}>Osoba zarchiwizowana</span>}
          </div>

          {/* Section: Basic Info */}
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

          {/* Section: Birth and Death */}
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
                  {renderInfoboxRow('Miejsce pochówku', bio.burialPlace)}
                </>
              )}
            </tbody>
          </table>

          {/* Section: Origin Family (Parents, Adoptive/Foster Parents, Siblings) */}
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

          {/* Section(s): Partnerships / Marriages & Children */}
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

        {/* 3. LEFT MAIN CONTENT (Tree + Biography Narrative + Optional Admin Raw View) */}
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

          <section className={styles.wikiSection}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 className={styles.wikiSectionTitle} style={{ borderBottom: 'none', paddingBottom: 0 }}>
                Drzewo przodków
              </h2>
              <Link
                to={`/tree?personId=${String(bio.id)}`}
                className={styles.btnSecondary}
              >
                🌳 Otwórz w pełnym drzewie →
              </Link>
            </div>
            <AncestorTree rootPersonId={bio.id} generations={3} mode="biography" />
          </section>

          <section className={styles.wikiSection}>
            <h2 className={styles.wikiSectionTitle}>Życiorys</h2>
            <div className={styles.placeholderBox}>
              Brak opracowanego życiorysu tekstowego dla tej osoby.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}