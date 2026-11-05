import { useState, useEffect, useId } from 'react';
import axios from 'axios';
import { mediaApi } from '../../api/mediaApi';
import { biographyApi } from '../../api/biographyApi';
import InteractiveAvatarCropper from '../PersonAvatar/InteractiveAvatarCropper';
import styles from './MediaGallerySection.module.css';
import type {
  MediaCollectionDto,
  MediaItemDto,
  MediaPrimaryContext,
  MediaType,
  SaveMediaPersonLinkRequestDto,
} from '../../types/media';
import type { PersonListItemDto, PersonSex } from '../../types/biography';

interface MediaItemLightboxModalProps {
  items: MediaItemDto[];
  activeIndex: number | null;
  context?: MediaPrimaryContext;
  graveId?: number;
  personId?: number;
  eventId?: number;
  collectionId?: number | null;
  primaryMediaId?: number | null;
  isAdmin: boolean;
  onClose: () => void;
  onNavigateIndex: (nextIndex: number) => void;
  onMediaUpdated: () => Promise<void> | void;
}

const QUALIFIER_OPTIONS = [
  { value: 'EXACT', label: 'Dokładnie' },
  { value: 'ABOUT', label: 'Około (ok.)' },
  { value: 'ESTIMATED', label: 'Szacunkowo' },
  { value: 'BEFORE', label: 'Przed' },
  { value: 'AFTER', label: 'Po' },
];

export const getMediaPersonLabels = (mediaType: MediaType) => {
  if (mediaType === 'VIDEO') {
    return {
      sectionTitle: 'Osoby na nagraniu wideo, osoby powiązane oraz autorzy (z bazy lub tekstowo):',
      depictedOption: '🎬 Osoba widoczna na filmie',
      relatedOption: '🔗 Osoba powiązana z filmem',
      authorOption: '🎥 Autor nagrania wideo (kto nagrał)',
      depictedBadge: '🎬 Na filmie',
      relatedBadge: '🔗 Powiązana',
      authorBadge: '🎥 Autor',
      depictedSummary: '🎬 Osoby na filmie:',
      authorSummary: '🎥 Autor filmu:',
    };
  }
  if (mediaType === 'AUDIO') {
    return {
      sectionTitle: 'Osoby na nagraniu audio (głos), osoby powiązane oraz autorzy (z bazy lub tekstowo):',
      depictedOption: '🎙️ Osoba słyszalna na nagraniu',
      relatedOption: '🔗 Osoba powiązana z nagraniem',
      authorOption: '🎧 Autor nagrania audio',
      depictedBadge: '🎙️ Na nagraniu',
      relatedBadge: '🔗 Powiązana',
      authorBadge: '🎧 Autor',
      depictedSummary: '🎙️ Osoby na nagraniu audio:',
      authorSummary: '🎧 Autor nagrania:',
    };
  }
  return {
    sectionTitle: 'Osoby na zdjęciu, osoby powiązane oraz autorzy (z bazy lub tekstowo):',
    depictedOption: '👁️ Osoba widoczna na zdjęciu',
    relatedOption: '🔗 Osoba powiązana ze zdjęciem',
    authorOption: '📷 Autor zdjęcia (kto wykonał)',
    depictedBadge: '👁️ Na zdjęciu',
    relatedBadge: '🔗 Powiązana',
    authorBadge: '📷 Autor',
    depictedSummary: '👁️ Osoby na zdjęciu:',
    authorSummary: '📷 Autor:',
  };
};

const getVersionTypeOptions = (mediaType: MediaType): { value: string; label: string }[] => {
  if (mediaType === 'VIDEO') {
    return [
      { value: 'RESTORED', label: 'Wersja odnowiona / zrekonstruowana' },
      { value: 'ENHANCED', label: 'Wersja w wyższej jakości (upscale / 60 kl./s)' },
      { value: 'COLORIZED', label: 'Wersja w kolorze' },
      { value: 'ORIGINAL', label: 'Oryginał' },
      { value: 'OTHER', label: 'Inna wersja (np. poprawiony dźwięk / napisy)' },
    ];
  }
  if (mediaType === 'AUDIO') {
    return [
      { value: 'RESTORED', label: 'Wersja odszumiona / oczyszczona (remaster)' },
      { value: 'ENHANCED', label: 'Wersja wzmocniona / wyostrzona' },
      { value: 'ORIGINAL', label: 'Oryginał' },
      { value: 'OTHER', label: 'Inna wersja (np. fragment nagrania)' },
    ];
  }
  return [
    { value: 'RESTORED', label: 'Wersja odnowiona (po retuszu)' },
    { value: 'COLORIZED', label: 'Wersja w kolorze' },
    { value: 'ENHANCED', label: 'Wersja wyostrzona / poprawiona' },
    { value: 'REVERSE', label: '🔄 Strona odwrotna (Rewers zdjęcia)' },
    { value: 'ORIGINAL', label: 'Oryginał' },
    { value: 'OTHER', label: 'Inna wersja' },
  ];
};

const getPolishWeekdayLabel = (y: string, m: string, d: string): string | null => {
  const yNum = Number(y);
  const mNum = Number(m);
  const dNum = Number(d);
  if (!yNum || !mNum || !dNum || mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) return null;
  const date = new Date(Date.UTC(yNum, mNum - 1, dNum, 12, 0, 0));
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pl-PL', { weekday: 'long' }).format(date);
};

const toIsoDateInputValue = (y: string, m: string, d: string): string => {
  const yNum = Number(y);
  const mNum = Number(m);
  const dNum = Number(d);
  if (!yNum || !mNum || !dNum || mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) return '';
  return `${String(yNum).padStart(4, '0')}-${String(mNum).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
};

const parseOptInt = (val: string): number | null => {
  const trimmed = val.trim();
  if (trimmed === '') return null;
  const num = Number(trimmed);
  return Number.isNaN(num) ? null : num;
};

const numToStr = (val: number | null | undefined): string =>
  val !== undefined && val !== null ? String(val) : '';

export default function MediaItemLightboxModal({
  items,
  activeIndex,
  context,
  graveId,
  personId,
  eventId,
  collectionId,
  primaryMediaId,
  isAdmin,
  onClose,
  onNavigateIndex,
  onMediaUpdated,
}: MediaItemLightboxModalProps) {
  const versionFileInputId = useId();

  const rawActiveItem =
    activeIndex !== null && activeIndex >= 0 && activeIndex < items.length
      ? items[activeIndex]
      : null;

  const [liveUpdatedItem, setLiveUpdatedItem] = useState<MediaItemDto | null>(null);
  const activeItem =
    liveUpdatedItem !== null && liveUpdatedItem.id === rawActiveItem?.id
      ? liveUpdatedItem
      : rawActiveItem;

  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [swipeTouchStart, setSwipeTouchStart] = useState<{ x: number; y: number } | null>(null);

  // Carousel animation state (-1 prev, 0 idle, 1 next)
  const [swipeOffsetX, setSwipeOffsetX] = useState<number>(0);
  const [carouselAnimTarget, setCarouselAnimTarget] = useState<-1 | 0 | 1>(0);

  const [showDetailsDrawer, setShowDetailsDrawer] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [showVersionUpload, setShowVersionUpload] = useState<boolean>(false);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionTypeInput, setVersionTypeInput] = useState<string>('RESTORED');
  const [versionLabelInput, setVersionLabelInput] = useState<string>('');
  const [versionSetAsMain, setVersionSetAsMain] = useState<boolean>(true);

  const [isEditingItem, setIsEditingItem] = useState<boolean>(false);
  const [editFileName, setEditFileName] = useState<string>('');
  const [editFolderName, setEditFolderName] = useState<string>('');
  const [editCollectionIds, setEditCollectionIds] = useState<number[]>([]);
  const [addCollectionSelectId, setAddCollectionSelectId] = useState<string>('');
  const [editIsPortrait, setEditIsPortrait] = useState<boolean>(false);
  const [editPortraitType, setEditPortraitType] = useState<'SINGLE' | 'GROUP'>('SINGLE');
  const [editIsUnknown, setEditIsUnknown] = useState<boolean>(false);

  const [editTitle, setEditTitle] = useState<string>('');
  const [editInscription, setEditInscription] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editSourceText, setEditSourceText] = useState<string>('');
  const [editDateMode, setEditDateMode] = useState<'MANUAL' | 'METADATA' | 'EVENT' | 'UNDATED'>('MANUAL');
  const [editSelectedMetadataTag, setEditSelectedMetadataTag] = useState<string>('');
  const [editIsBetween, setEditIsBetween] = useState<boolean>(false);
  const [editDateQual, setEditDateQual] = useState<string>('EXACT');
  const [editYear, setEditYear] = useState<string>('');
  const [editMonth, setEditMonth] = useState<string>('');
  const [editDay, setEditDay] = useState<string>('');
  const [editTimeQual, setEditTimeQual] = useState<string>('EXACT');
  const [editHour, setEditHour] = useState<string>('');
  const [editMinute, setEditMinute] = useState<string>('');
  const [editSecond, setEditSecond] = useState<string>('');
  const [editRangeEndQual, setEditRangeEndQual] = useState<string>('EXACT');
  const [editRangeEndYear, setEditRangeEndYear] = useState<string>('');
  const [editRangeEndMonth, setEditRangeEndMonth] = useState<string>('');
  const [editRangeEndDay, setEditRangeEndDay] = useState<string>('');
  const [editRangeEndTimeQual, setEditRangeEndTimeQual] = useState<string>('EXACT');
  const [editRangeEndHour, setEditRangeEndHour] = useState<string>('');
  const [editRangeEndMinute, setEditRangeEndMinute] = useState<string>('');
  const [editRangeEndSecond, setEditRangeEndSecond] = useState<string>('');

  const [editPersonLinks, setEditPersonLinks] = useState<
    (SaveMediaPersonLinkRequestDto & { displayLabel: string })[]
  >([]);
  const [linkRoleType, setLinkRoleType] = useState<'DEPICTED' | 'RELATED' | 'AUTHOR'>('DEPICTED');
  const [linkPersonQuery, setLinkPersonQuery] = useState<string>('');
  const [linkPersonResults, setLinkPersonResults] = useState<PersonListItemDto[]>([]);
  const [linkTextInput, setLinkTextInput] = useState<string>('');
  const [linkTextSex, setLinkTextSex] = useState<PersonSex>('UNKNOWN');

  const [showCropper, setShowCropper] = useState<boolean>(false);
  const [showDeleteFileConfirm, setShowDeleteFileConfirm] = useState<boolean>(false);
  const [versionIdToDelete, setVersionIdToDelete] = useState<number | null>(null);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState<boolean>(false);
  const [availableCollections, setAvailableCollections] = useState<MediaCollectionDto[]>([]);
  const [unlinkTargetCollectionId, setUnlinkTargetCollectionId] = useState<string>('');

  const triggerSlideNavigation = (direction: -1 | 1) => {
    if (items.length <= 1 || activeIndex === null || carouselAnimTarget !== 0) return;
    setCarouselAnimTarget(direction);
    setSwipeOffsetX(0);
    window.setTimeout(() => {
      setCarouselAnimTarget(0);
      onNavigateIndex((activeIndex + direction + items.length) % items.length);
    }, 260);
  };

  const syncSingleEditFields = (item: MediaItemDto) => {
    const pLabels = getMediaPersonLabels(item.mediaType);
    setEditFileName(item.fileName);
    setEditFolderName('');
    setEditCollectionIds(
      item.collectionIds && item.collectionIds.length > 0
        ? item.collectionIds
        : item.collectionId
          ? [item.collectionId]
          : []
    );
    setEditIsPortrait(Boolean(item.portrait));
    setEditPortraitType(item.groupPortrait ? 'GROUP' : 'SINGLE');
    setEditIsUnknown(Boolean(item.unknownMedia));
    setEditTitle(item.title ?? '');
    setEditInscription(item.inscriptionText ?? '');
    setEditDescription(item.description ?? '');
    setEditSourceText(item.sourceText ?? '');
    setEditDateMode('MANUAL');
    setEditSelectedMetadataTag(
      item.metadataDateSource ?? item.availableMetadataDates?.at(0)?.sourceTag ?? ''
    );
    setEditIsBetween(item.betweenRange === true);
    setEditDateQual(item.dateQualifier ?? 'EXACT');
    setEditYear(numToStr(item.year));
    setEditMonth(numToStr(item.month));
    setEditDay(numToStr(item.day));
    setEditTimeQual(item.timeQualifier ?? 'EXACT');
    setEditHour(numToStr(item.hour));
    setEditMinute(numToStr(item.minute));
    setEditSecond(numToStr(item.second));
    setEditRangeEndQual(item.rangeEndQualifier ?? 'EXACT');
    setEditRangeEndYear(numToStr(item.rangeEndYear));
    setEditRangeEndMonth(numToStr(item.rangeEndMonth));
    setEditRangeEndDay(numToStr(item.rangeEndDay));
    setEditRangeEndTimeQual(item.rangeEndTimeQualifier ?? 'EXACT');
    setEditRangeEndHour(numToStr(item.rangeEndHour));
    setEditRangeEndMinute(numToStr(item.rangeEndMinute));
    setEditRangeEndSecond(numToStr(item.rangeEndSecond));

    const combinedLinks: (SaveMediaPersonLinkRequestDto & { displayLabel: string })[] = [];
    for (const d of item.depictedPersons ?? []) {
      combinedLinks.push({
        personId: d.personId,
        personText: d.personText,
        personSex: d.sex,
        linkType: 'DEPICTED',
        displayLabel: `${pLabels.depictedBadge}: ${d.displayName}`,
      });
    }
    for (const r of item.relatedPersons ?? []) {
      combinedLinks.push({
        personId: r.personId,
        personText: r.personText,
        personSex: r.sex,
        linkType: 'RELATED',
        displayLabel: `${pLabels.relatedBadge}: ${r.displayName}`,
      });
    }
    for (const a of item.authors ?? []) {
      combinedLinks.push({
        personId: a.personId,
        personText: a.personText,
        personSex: a.sex,
        linkType: 'AUTHOR',
        displayLabel: `${pLabels.authorBadge}: ${a.displayName}`,
      });
    }
    setEditPersonLinks(combinedLinks);
  };

  useEffect(() => {
    if (!rawActiveItem) return;
    setLiveUpdatedItem(null);
    setSelectedVersionId(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsEditingItem(false);
    setShowCropper(false);
    setShowVersionUpload(false);
    setErrorMessage(null);
    setSwipeOffsetX(0);
    setCarouselAnimTarget(0);
    syncSingleEditFields(rawActiveItem);
  }, [rawActiveItem?.id]);

  useEffect(() => {
    if (activeIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && items.length > 1) {
        triggerSlideNavigation(-1);
      } else if (e.key === 'ArrowRight' && items.length > 1) {
        triggerSlideNavigation(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeIndex, items.length, onClose, onNavigateIndex, carouselAnimTarget]);

  if (!activeItem || activeIndex === null) return null;

  const personLabels = getMediaPersonLabels(activeItem.mediaType);

  const doesUnlinkRequireTargetCollection = (): boolean => {
    const remainingEvents = (activeItem.eventIds ?? []).filter(id => id !== eventId);
    const remainingGraves = activeItem.graveIds.filter(id => id !== graveId);
    const remainingPersons = activeItem.personIds.filter(id => id !== personId);
    const currentCols =
      activeItem.collectionIds && activeItem.collectionIds.length > 0
        ? activeItem.collectionIds
        : activeItem.collectionId
          ? [activeItem.collectionId]
          : [];
    const remainingCols = currentCols.filter(id => id !== collectionId);

    const losingEventFolder =
      eventId !== undefined &&
      remainingEvents.length === 0 &&
      activeItem.primaryContext === 'EVENT';
    const losingGraveFolder =
      graveId !== undefined &&
      remainingGraves.length === 0 &&
      activeItem.primaryContext === 'GRAVE';
    const losingAllRefs =
      remainingEvents.length === 0 &&
      remainingGraves.length === 0 &&
      remainingPersons.length === 0 &&
      remainingCols.length === 0;

    return (
      losingAllRefs ||
      ((losingEventFolder || losingGraveFolder) &&
        remainingCols.length === 0 &&
        remainingEvents.length === 0 &&
        remainingGraves.length === 0)
    );
  };

  const handleOpenUnlinkModal = async () => {
    setErrorMessage(null);
    setShowUnlinkConfirm(true);
    try {
      const cols = await mediaApi.getAllCollections();
      setAvailableCollections(cols);
    } catch {
      setAvailableCollections([]);
    }
  };

  const handleConfirmUnlink = async () => {
    const needsCollection = doesUnlinkRequireTargetCollection();
    if (needsCollection && unlinkTargetCollectionId === '') {
      setErrorMessage('Wybierz kolekcję docelową, do której ma trafić odpinany plik.');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await mediaApi.unlinkMediaFromContext(activeItem.id, {
        graveId,
        personId,
        eventId,
        collectionId: collectionId ?? undefined,
        targetCollectionId:
          unlinkTargetCollectionId !== '' ? Number(unlinkTargetCollectionId) : undefined,
      });
      setShowUnlinkConfirm(false);
      onClose();
      await onMediaUpdated();
    } catch (err: unknown) {
      if (axios.isAxiosError<{ message?: string }>(err) && err.response?.data.message) {
        setErrorMessage(err.response.data.message);
      } else {
        setErrorMessage('Nie udało się odpiąć pliku z tego miejsca.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeleteFile = async () => {
    setIsSubmitting(true);
    try {
      await mediaApi.deleteMedia(activeItem.id);
      setShowDeleteFileConfirm(false);
      onClose();
      await onMediaUpdated();
    } catch {
      setErrorMessage('Nie udało się usunąć pliku.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeleteVersion = async () => {
    if (versionIdToDelete === null) return;
    setIsSubmitting(true);
    try {
      const updated = await mediaApi.deleteMediaVersion(activeItem.id, versionIdToDelete);
      setLiveUpdatedItem(updated);
      setVersionIdToDelete(null);
      setSelectedVersionId(null);
      await onMediaUpdated();
    } catch {
      setErrorMessage('Nie można usunąć tej wersji pliku.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSearchPersonForLink = async () => {
    try {
      const page = await biographyApi.listPeople({
        search: linkPersonQuery,
        includeArchived: true,
        page: 0,
        size: 6,
      });
      setLinkPersonResults(page.content);
    } catch {
      setErrorMessage('Nie udało się wyszukać osób.');
    }
  };

  const handleStartEditMode = async () => {
    setIsEditingItem(true);
    try {
      const cols = await mediaApi.getAllCollections();
      setAvailableCollections(cols);
    } catch {
      // Ignore collection fetch error
    }
  };

  const handleMoveCollectionOrder = (idx: number, dir: -1 | 1) => {
    setEditCollectionIds(prev => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const tmp = copy[idx];
      copy[idx] = copy[target];
      copy[target] = tmp;
      return copy;
    });
  };

  const handleSaveItemEdit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const updated = await mediaApi.updateMedia(activeItem.id, {
        fileName: editFileName,
        customFolderName: editFolderName.trim() || null,
        collectionIds: editCollectionIds,
        portrait: editIsPortrait,
        groupPortrait: editIsPortrait ? editPortraitType === 'GROUP' : false,
        unknownMedia: editIsUnknown,
        title: editTitle,
        inscriptionText: editInscription,
        description: editDescription,
        sourceText: editSourceText,
        dateSourceMode: editDateMode,
        selectedMetadataSourceTag: editSelectedMetadataTag || null,
        contextEventId: eventId ?? null,
        isBetweenRange: editIsBetween,
        dateQualifier: editDateQual,
        year: parseOptInt(editYear),
        month: parseOptInt(editMonth),
        day: parseOptInt(editDay),
        timeQualifier: editTimeQual,
        hour: parseOptInt(editHour),
        minute: parseOptInt(editMinute),
        second: parseOptInt(editSecond),
        rangeEndQualifier: editRangeEndQual,
        rangeEndYear: parseOptInt(editRangeEndYear),
        rangeEndMonth: parseOptInt(editRangeEndMonth),
        rangeEndDay: parseOptInt(editRangeEndDay),
        rangeEndTimeQualifier: editRangeEndTimeQual,
        rangeEndHour: parseOptInt(editRangeEndHour),
        rangeEndMinute: parseOptInt(editRangeEndMinute),
        rangeEndSecond: parseOptInt(editRangeEndSecond),
        personLinks: editPersonLinks.map(l => ({
          personId: l.personId,
          personText: l.personText,
          personSex: l.personSex,
          linkType: l.linkType,
        })),
      });
      setLiveUpdatedItem(updated);
      syncSingleEditFields(updated);
      setIsEditingItem(false);
      await onMediaUpdated();
    } catch (err: unknown) {
      if (axios.isAxiosError<{ message?: string }>(err) && err.response?.data.message) {
        setErrorMessage(err.response.data.message);
      } else {
        setErrorMessage('Nie udało się zaktualizować danych pliku.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadVersionSubmit = async () => {
    if (!versionFile) return;
    setIsSubmitting(true);
    try {
      const updated = await mediaApi.uploadMediaVersion({
        mediaId: activeItem.id,
        file: versionFile,
        versionType: versionTypeInput,
        versionLabel: versionLabelInput.trim() || undefined,
        setAsMain: versionTypeInput !== 'REVERSE' && versionSetAsMain,
      });
      setLiveUpdatedItem(updated);
      setShowVersionUpload(false);
      setVersionFile(null);
      setVersionLabelInput('');
      setSelectedVersionId(null);
      await onMediaUpdated();
    } catch {
      setErrorMessage('Nie udało się wgrać nowej wersji pliku.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetVersionAsMain = async (versionId: number) => {
    try {
      const updated = await mediaApi.setMainMediaVersion(activeItem.id, versionId);
      setLiveUpdatedItem(updated);
      setSelectedVersionId(null);
      await onMediaUpdated();
    } catch {
      setErrorMessage('Nie udało się ustawić wybranej wersji jako głównej.');
    }
  };

  const handleSavePrimaryOrAvatarCrop = async (cx?: number, cy?: number, cz?: number) => {
    try {
      const updated = await mediaApi.updateMedia(activeItem.id, {
        setAsAvatarForPersonId: personId ?? null,
        avatarCropX: personId !== undefined ? (cx ?? 50) : null,
        avatarCropY: personId !== undefined ? (cy ?? 50) : null,
        avatarCropZoom: personId !== undefined ? (cz ?? 1.0) : null,
        setAsPrimaryForGraveId: graveId ?? null,
      });
      setLiveUpdatedItem(updated);
      setShowCropper(false);
      await onMediaUpdated();
    } catch {
      setErrorMessage('Nie udało się ustawić zdjęcia/filmu jako głównego.');
    }
  };

  const activeVersions = activeItem.versions ?? [];
  const activeSelectedVersion =
    selectedVersionId !== null
      ? (activeVersions.find(v => v.id === selectedVersionId) ?? null)
      : null;
      
  const versionOptions = getVersionTypeOptions(activeItem.mediaType);
  const startWeekday = getPolishWeekdayLabel(editYear, editMonth, editDay);
  const endWeekday = getPolishWeekdayLabel(editRangeEndYear, editRangeEndMonth, editRangeEndDay);

  const roleBadgeForType = (role: 'DEPICTED' | 'RELATED' | 'AUTHOR'): string => {
    if (role === 'DEPICTED') return personLabels.depictedBadge;
    if (role === 'RELATED') return personLabels.relatedBadge;
    return personLabels.authorBadge;
  };

  const prevItem =
    items.length > 1 ? items[(activeIndex - 1 + items.length) % items.length] : null;
  const nextItem =
    items.length > 1 ? items[(activeIndex + 1) % items.length] : null;

  const renderSlideMediaContent = (slideItem: MediaItemDto, isCenterActive: boolean) => {
    const url =
      isCenterActive && activeSelectedVersion
        ? mediaApi.getVersionFileUrl(slideItem.id, activeSelectedVersion.id)
        : mediaApi.getFileUrl(slideItem.id);

    if (
      slideItem.mediaType === 'VIDEO' &&
      !(isCenterActive && activeSelectedVersion?.reverseSide)
    ) {
      return (
        <video
          src={isCenterActive ? url : `${url}#t=0.5`}
          controls={isCenterActive}
          muted={!isCenterActive}
          preload="metadata"
          style={{ maxWidth: '94vw', maxHeight: '78vh', objectFit: 'contain' }}
        />
      );
    }
    if (slideItem.mediaType === 'AUDIO') {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.25rem',
            padding: '2rem',
            background: 'rgba(15, 23, 42, 0.85)',
            borderRadius: '16px',
            maxWidth: '90vw',
            width: '460px',
          }}
        >
          <span style={{ fontSize: '4.5rem', color: '#818cf8' }}>🎵</span>
          <div
            style={{
              fontSize: '1.2rem',
              fontWeight: 700,
              color: '#ffffff',
              textAlign: 'center',
            }}
          >
            {slideItem.title ?? slideItem.fileName}
          </div>
          {isCenterActive && (
            <audio src={url} controls style={{ width: '100%', borderRadius: '30px' }} />
          )}
        </div>
      );
    }
    return (
      <img
        src={url}
        alt={slideItem.title ?? ''}
        draggable={false}
        style={{
          maxWidth: '94vw',
          maxHeight: showDetailsDrawer ? '44vh' : '80vh',
          objectFit: 'contain',
        }}
      />
    );
  };

  return (
    <div
      className={styles.fullscreenOverlay}
      data-testid="media-lightbox-modal"
      onClick={onClose}
    >
      <div
        className={styles.fullscreenTopBar}
        onClick={e => {
          e.stopPropagation();
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            {activeItem.title ?? 'Podgląd multimediów'} ({String(activeIndex + 1)} /{' '}
            {String(items.length)})
          </span>

          {activeVersions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {activeVersions.map(ver => {
                const isVerActive =
                  selectedVersionId !== null ? selectedVersionId === ver.id : ver.main;
                return (
                  <button
                    key={ver.id}
                    type="button"
                    onClick={() => {
                      setSelectedVersionId(ver.id);
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                    }}
                    style={{
                      padding: '0.22rem 0.6rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      borderRadius: '999px',
                      border: isVerActive
                        ? '1px solid #60a5fa'
                        : '1px solid rgba(255,255,255,0.3)',
                      backgroundColor: isVerActive ? '#2563eb' : 'rgba(255,255,255,0.12)',
                      color: '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    {ver.reverseSide ? '🔄 ' : ver.main ? '⭐ ' : ''}
                    {ver.versionLabel}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.topBarButtons}>
          {activeItem.mediaType === 'IMAGE' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setZoom(prev => Math.max(1, prev - 0.5));
                }}
                className={styles.btnSecondary}
              >
                −
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className={styles.btnSecondary}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(prev => Math.min(5, prev + 0.5));
                }}
                className={styles.btnSecondary}
              >
                +
              </button>
            </>
          )}
          <button
            type="button"
            data-testid="toggle-media-details-drawer"
            onClick={() => {
              setShowDetailsDrawer(prev => !prev);
            }}
            className={styles.btnSecondary}
          >
            ℹ️ {showDetailsDrawer ? 'Ukryj szczegóły' : isAdmin ? 'Szczegóły i opcje' : 'Szczegóły'}
          </button>
          <button type="button" onClick={onClose} className={styles.btnSecondary}>
            ✕ Zamknij
          </button>
        </div>
      </div>

      <div
        className={styles.viewerStage}
        onClick={e => {
          e.stopPropagation();
        }}
        onWheel={e => {
          if (activeItem.mediaType !== 'IMAGE') return;
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.25 : -0.25;
          setZoom(prev => {
            const next = Math.min(5, Math.max(1, prev + delta));
            if (next === 1) setPan({ x: 0, y: 0 });
            return next;
          });
        }}
        onMouseDown={e => {
          if (zoom > 1) {
            setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
          }
        }}
        onMouseMove={e => {
          if (dragStart && zoom > 1) {
            setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
          }
        }}
        onMouseUp={() => {
          setDragStart(null);
        }}
        onTouchStart={e => {
          if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            setPinchStartDist(Math.hypot(dx, dy));
            setSwipeTouchStart(null);
          } else if (e.touches.length === 1) {
            if (zoom > 1) {
              setDragStart({
                x: e.touches[0].clientX - pan.x,
                y: e.touches[0].clientY - pan.y,
              });
              setSwipeTouchStart(null);
            } else {
              setSwipeTouchStart({
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
              });
            }
          }
        }}
        onTouchMove={e => {
          if (e.touches.length === 2 && pinchStartDist !== null) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const scaleFactor = dist / pinchStartDist;
            setZoom(prev => Math.min(5, Math.max(1, prev * scaleFactor)));
            setPinchStartDist(dist);
          } else if (e.touches.length === 1 && dragStart && zoom > 1) {
            setPan({
              x: e.touches[0].clientX - dragStart.x,
              y: e.touches[0].clientY - dragStart.y,
            });
          } else if (e.touches.length === 1 && swipeTouchStart && zoom === 1) {
            const dx = e.touches[0].clientX - swipeTouchStart.x;
            const dy = e.touches[0].clientY - swipeTouchStart.y;
            if (Math.abs(dx) > Math.abs(dy)) {
              setSwipeOffsetX(dx);
            }
          }
        }}
        onTouchEnd={e => {
          if (
            swipeTouchStart &&
            zoom === 1 &&
            items.length > 1 &&
            e.changedTouches.length === 1
          ) {
            const dx = e.changedTouches[0].clientX - swipeTouchStart.x;
            const dy = e.changedTouches[0].clientY - swipeTouchStart.y;
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
              if (dx < 0) {
                triggerSlideNavigation(1);
              } else {
                triggerSlideNavigation(-1);
              }
            }
          }
          setSwipeOffsetX(0);
          setSwipeTouchStart(null);
          setPinchStartDist(null);
          setDragStart(null);
        }}
      >
        {items.length > 1 && (
          <button
            type="button"
            aria-label="Poprzednie zdjęcie lub film"
            onClick={() => {
              triggerSlideNavigation(-1);
            }}
            className={`${styles.navArrowBtn} ${styles.navArrowLeft}`}
          >
            ‹
          </button>
        )}

        {items.length > 1 && zoom === 1 ? (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              transform:
                carouselAnimTarget === 1
                  ? 'translate3d(-100%, 0, 0)'
                  : carouselAnimTarget === -1
                    ? 'translate3d(100%, 0, 0)'
                    : `translate3d(${String(swipeOffsetX)}px, 0, 0)`,
              transition:
                carouselAnimTarget !== 0
                  ? 'transform 0.26s cubic-bezier(0.22, 1, 0.36, 1)'
                  : swipeOffsetX !== 0
                    ? 'none'
                    : 'transform 0.2s ease-out',
            }}
          >
            {prevItem && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: 'translateX(-100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                {renderSlideMediaContent(prevItem, false)}
              </div>
            )}

            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {renderSlideMediaContent(activeItem, true)}
            </div>

            {nextItem && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: 'translateX(100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                {renderSlideMediaContent(nextItem, false)}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              transform: `translate(${String(pan.x)}px, ${String(pan.y)}px) scale(${String(zoom)})`,
              transition: dragStart ? 'none' : 'transform 0.1s ease-out',
              cursor: zoom > 1 ? 'grab' : 'default',
              maxWidth: '94vw',
              maxHeight: showDetailsDrawer ? '44vh' : '82vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {renderSlideMediaContent(activeItem, true)}
          </div>
        )}

        {items.length > 1 && (
          <button
            type="button"
            aria-label="Następne zdjęcie lub film"
            onClick={() => {
              triggerSlideNavigation(1);
            }}
            className={`${styles.navArrowBtn} ${styles.navArrowRight}`}
          >
            ›
          </button>
        )}
      </div>

      {showDetailsDrawer && (
        <div
          className={styles.detailsDrawer}
          onClick={e => {
            e.stopPropagation();
          }}
        >
          {errorMessage && (
            <div role="alert" style={{ color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>
              {errorMessage}
            </div>
          )}

          {isEditingItem ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label htmlFor="edit-media-filename" className={styles.label}>
                    Nazwa pliku na dysku (snake_case)
                  </label>
                  <input
                    id="edit-media-filename"
                    type="text"
                    value={editFileName}
                    onChange={e => {
                      setEditFileName(e.target.value);
                    }}
                    className={styles.input}
                  />
                </div>
                <div className={styles.formField}>
                  <label htmlFor="edit-media-folder" className={styles.label}>
                    Zmień nazwę całego folderu docelowego (opcjonalnie)
                  </label>
                  <input
                    id="edit-media-folder"
                    type="text"
                    placeholder={activeItem.directoryPath ?? 'np. nowy_folder'}
                    value={editFolderName}
                    onChange={e => {
                      setEditFolderName(e.target.value);
                    }}
                    className={styles.input}
                  />
                </div>
                <div className={styles.formField}>
                  <label htmlFor="edit-media-title" className={styles.label}>
                    Tytuł (krótka nazwa kafelka)
                  </label>
                  <input
                    id="edit-media-title"
                    type="text"
                    value={editTitle}
                    onChange={e => {
                      setEditTitle(e.target.value);
                    }}
                    className={styles.input}
                  />
                </div>
                <div className={styles.formField}>
                  <label htmlFor="edit-media-source" className={styles.label}>
                    Źródło pliku (tekstowo)
                  </label>
                  <input
                    id="edit-media-source"
                    type="text"
                    placeholder="np. Z albumu babci Katarzyny"
                    value={editSourceText}
                    onChange={e => {
                      setEditSourceText(e.target.value);
                    }}
                    className={styles.input}
                  />
                </div>
                <div className={styles.formField}>
                  <label htmlFor="edit-media-inscription" className={styles.label}>
                    Podpis z odwrotu zdjęcia / oryginalna dedykacja
                  </label>
                  <input
                    id="edit-media-inscription"
                    type="text"
                    placeholder="np. Na pamiątkę z Krynicy, 1938 r."
                    value={editInscription}
                    onChange={e => {
                      setEditInscription(e.target.value);
                    }}
                    className={styles.input}
                  />
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.2rem', alignItems: 'center' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.83rem', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={editIsPortrait}
                      onChange={e => {
                        setEditIsPortrait(e.target.checked);
                        if (e.target.checked) setEditIsUnknown(false);
                      }}
                    />
                    <span>Portret (zdjęcie portretowe osoby)</span>
                  </label>

                  {editIsPortrait && (
                    <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 }}>
                        <input
                          type="radio"
                          name="editPortraitType"
                          checked={editPortraitType === 'SINGLE'}
                          onChange={() => {
                            setEditPortraitType('SINGLE');
                          }}
                        />
                        <span>👤 Portret pojedynczy</span>
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 }}>
                        <input
                          type="radio"
                          name="editPortraitType"
                          checked={editPortraitType === 'GROUP'}
                          onChange={() => {
                            setEditPortraitType('GROUP');
                          }}
                        />
                        <span>👥 Portret grupowy</span>
                      </label>
                    </div>
                  )}

                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.83rem', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={editIsUnknown}
                      onChange={e => {
                        setEditIsUnknown(e.target.checked);
                        if (e.target.checked) setEditIsPortrait(false);
                      }}
                    />
                    <span>❓ Oznacz jako nieznane (do identyfikacji)</span>
                  </label>
                </div>

                {availableCollections.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <span className={styles.label}>
                      Przypisane kolekcje (pierwsza kolekcja na liście określa folder na dysku):
                    </span>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <select
                        value={addCollectionSelectId}
                        onChange={e => {
                          setAddCollectionSelectId(e.target.value);
                        }}
                        className={styles.input}
                        style={{ maxWidth: '340px' }}
                      >
                        <option value="">— Wybierz kolekcję do dodania —</option>
                        {availableCollections
                          .filter(c => !editCollectionIds.includes(c.id))
                          .map(col => (
                            <option key={col.id} value={String(col.id)}>
                              {col.datedCollection ? `📅 [Album] ${col.name}` : `📦 [Kolekcja] ${col.name}`}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (!addCollectionSelectId) return;
                          const cId = Number(addCollectionSelectId);
                          if (!editCollectionIds.includes(cId)) {
                            setEditCollectionIds(prev => [...prev, cId]);
                          }
                          setAddCollectionSelectId('');
                        }}
                        className={styles.btnSecondary}
                      >
                        + Dodaj do kolekcji
                      </button>
                    </div>

                    {editCollectionIds.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                        {editCollectionIds.map((cId, cIdx) => {
                          const colObj = availableCollections.find(c => c.id === cId);
                          return (
                            <span key={cId} className={styles.selectedFilesBadge} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                              <span>
                                {cIdx === 0 ? '📁 [Główna] ' : '📦 '}
                                {colObj?.name ?? 'Kolekcja'}
                              </span>
                              <button
                                type="button"
                                disabled={cIdx === 0}
                                onClick={() => {
                                  handleMoveCollectionOrder(cIdx, -1);
                                }}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700 }}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={cIdx === editCollectionIds.length - 1}
                                onClick={() => {
                                  handleMoveCollectionOrder(cIdx, 1);
                                }}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700 }}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditCollectionIds(prev => prev.filter(id => id !== cId));
                                }}
                                className={styles.pillRemoveBtn}
                              >
                                ✕
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.formField} style={{ width: '100%' }}>
                <label htmlFor="edit-media-desc" className={styles.label}>
                  Opis tekstowy (zwykły tekst)
                </label>
                <textarea
                  id="edit-media-desc"
                  rows={4}
                  placeholder="Dodatkowe informacje o zdjęciu/nagraniu..."
                  value={editDescription}
                  onChange={e => {
                    setEditDescription(e.target.value);
                  }}
                  className={styles.textarea}
                />
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label htmlFor="edit-media-date-mode" className={styles.label}>
                    Źródło daty i czasu tego pliku
                  </label>
                  <select
                    id="edit-media-date-mode"
                    value={editDateMode}
                    onChange={e => {
                      const nextM = e.target.value as 'MANUAL' | 'METADATA' | 'EVENT' | 'UNDATED';
                      setEditDateMode(nextM);
                      if (nextM === 'METADATA') {
                        setEditIsBetween(false);
                        setEditDateQual('EXACT');
                        setEditTimeQual('EXACT');
                        if (activeItem.metadataYear) {
                          setEditYear(numToStr(activeItem.metadataYear));
                          setEditMonth(numToStr(activeItem.metadataMonth));
                          setEditDay(numToStr(activeItem.metadataDay));
                          setEditHour(numToStr(activeItem.metadataHour));
                          setEditMinute(numToStr(activeItem.metadataMinute));
                          setEditSecond(numToStr(activeItem.metadataSecond));
                        }
                      }
                    }}
                    className={styles.input}
                  >
                    <option value="MANUAL">
                      Wpisz datę i czas ręcznie (lub przedział „między … a …”)
                    </option>
                    <option value="METADATA">
                      Przywróć datę i czas z metadanych pliku (zawsze Dokładnie)
                    </option>
                    {eventId !== undefined && (
                      <option value="EVENT">Ustaw z daty bieżącego wydarzenia</option>
                    )}
                    <option value="UNDATED">Wyczyść datę (undated)</option>
                  </select>
                </div>

                {editDateMode === 'METADATA' &&
                  activeItem.availableMetadataDates &&
                  activeItem.availableMetadataDates.length > 0 && (
                    <div className={styles.formField}>
                      <label htmlFor="edit-media-meta-tag" className={styles.label}>
                        Wybierz pole metadanych pliku
                      </label>
                      <select
                        id="edit-media-meta-tag"
                        value={editSelectedMetadataTag}
                        onChange={e => {
                          const tag = e.target.value;
                          setEditSelectedMetadataTag(tag);
                          const opt = activeItem.availableMetadataDates?.find(
                            o => o.sourceTag === tag
                          );
                          if (opt) {
                            setEditYear(numToStr(opt.year));
                            setEditMonth(numToStr(opt.month));
                            setEditDay(numToStr(opt.day));
                            setEditHour(numToStr(opt.hour));
                            setEditMinute(numToStr(opt.minute));
                            setEditSecond(numToStr(opt.second));
                          }
                        }}
                        className={styles.input}
                      >
                        {activeItem.availableMetadataDates.map(opt => (
                          <option key={opt.sourceTag} value={opt.sourceTag}>
                            {opt.sourceTag} — {opt.dateText}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
              </div>

              {editDateMode === 'MANUAL' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '0.75rem',
                  }}
                >
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={editIsBetween}
                      onChange={e => {
                        setEditIsBetween(e.target.checked);
                      }}
                    />
                    <span>Przedział niepewności „między … a …” dla daty wykonania</span>
                  </label>

                  <div className={styles.formGrid}>
                    <div className={styles.formField}>
                      <span className={styles.label}>Kwalifikator daty</span>
                      <select
                        value={editDateQual}
                        onChange={e => {
                          setEditDateQual(e.target.value);
                        }}
                        className={styles.input}
                      >
                        {QUALIFIER_OPTIONS.map(q => (
                          <option key={q.value} value={q.value}>
                            {q.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.formField}>
                      <span className={styles.label}>
                        Wybór z kalendarza {startWeekday ? `(📅 ${startWeekday})` : ''}
                      </span>
                      <input
                        type="date"
                        value={toIsoDateInputValue(editYear, editMonth, editDay)}
                        onChange={e => {
                          if (e.target.value) {
                            const p = e.target.value.split('-');
                            if (p.length === 3) {
                              setEditYear(String(Number(p[0])));
                              setEditMonth(String(Number(p[1])));
                              setEditDay(String(Number(p[2])));
                            }
                          }
                        }}
                        className={styles.input}
                      />
                    </div>

                    <div className={styles.formField}>
                      <span className={styles.label}>Rok / Miesiąc / Dzień</span>
                      <div className={styles.compactDateTimeInputs}>
                        <input
                          type="number"
                          placeholder="RRRR"
                          value={editYear}
                          onChange={e => {
                            setEditYear(e.target.value);
                          }}
                          className={`${styles.miniDateInput} ${styles.miniYearInput}`}
                        />
                        <input
                          type="number"
                          min={1}
                          max={12}
                          placeholder="MM"
                          value={editMonth}
                          onChange={e => {
                            setEditMonth(e.target.value);
                          }}
                          className={styles.miniDateInput}
                        />
                        <input
                          type="number"
                          min={1}
                          max={31}
                          placeholder="DD"
                          value={editDay}
                          onChange={e => {
                            setEditDay(e.target.value);
                          }}
                          className={styles.miniDateInput}
                        />
                      </div>
                    </div>

                    <div className={styles.formField}>
                      <span className={styles.label}>Kwalifikator i czas (GG:MM:SS)</span>
                      <div className={styles.compactDateTimeInputs}>
                        <select
                          value={editTimeQual}
                          onChange={e => {
                            setEditTimeQual(e.target.value);
                          }}
                          className={styles.input}
                          style={{ width: 'auto', minWidth: '165px', height: '34px' }}
                        >
                          {QUALIFIER_OPTIONS.map(q => (
                            <option key={q.value} value={q.value}>
                              {q.label}
                            </option>
                          ))}
                        </select>
                        <div className={styles.timeHmsGroup}>
                          <input
                            type="number"
                            min={0}
                            max={23}
                            placeholder="GG"
                            value={editHour}
                            onChange={e => {
                              setEditHour(e.target.value);
                            }}
                            className={styles.miniDateInput}
                          />
                          <span>:</span>
                          <input
                            type="number"
                            min={0}
                            max={59}
                            placeholder="MM"
                            value={editMinute}
                            onChange={e => {
                              setEditMinute(e.target.value);
                            }}
                            className={styles.miniDateInput}
                          />
                          <span>:</span>
                          <input
                            type="number"
                            min={0}
                            max={59}
                            placeholder="SS"
                            value={editSecond}
                            onChange={e => {
                              setEditSecond(e.target.value);
                            }}
                            className={styles.miniDateInput}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {editIsBetween && (
                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '0.65rem' }}>
                      <div className={styles.formGrid}>
                        <div className={styles.formField}>
                          <span className={styles.label}>Druga granica („… a …”)</span>
                          <select
                            value={editRangeEndQual}
                            onChange={e => {
                              setEditRangeEndQual(e.target.value);
                            }}
                            className={styles.input}
                          >
                            {QUALIFIER_OPTIONS.map(q => (
                              <option key={q.value} value={q.value}>
                                {q.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className={styles.formField}>
                          <span className={styles.label}>
                            Wybór z kalendarza {endWeekday ? `(📅 ${endWeekday})` : ''}
                          </span>
                          <input
                            type="date"
                            value={toIsoDateInputValue(
                              editRangeEndYear,
                              editRangeEndMonth,
                              editRangeEndDay
                            )}
                            onChange={e => {
                              if (e.target.value) {
                                const p = e.target.value.split('-');
                                if (p.length === 3) {
                                  setEditRangeEndYear(String(Number(p[0])));
                                  setEditRangeEndMonth(String(Number(p[1])));
                                  setEditRangeEndDay(String(Number(p[2])));
                                }
                              }
                            }}
                            className={styles.input}
                          />
                        </div>

                        <div className={styles.formField}>
                          <span className={styles.label}>Rok / Miesiąc / Dzień końca</span>
                          <div className={styles.compactDateTimeInputs}>
                            <input
                              type="number"
                              placeholder={editYear || 'RRRR'}
                              value={editRangeEndYear}
                              onChange={e => {
                                setEditRangeEndYear(e.target.value);
                              }}
                              className={`${styles.miniDateInput} ${styles.miniYearInput}`}
                            />
                            <input
                              type="number"
                              min={1}
                              max={12}
                              placeholder="MM"
                              value={editRangeEndMonth}
                              onChange={e => {
                                setEditRangeEndMonth(e.target.value);
                              }}
                              className={styles.miniDateInput}
                            />
                            <input
                              type="number"
                              min={1}
                              max={31}
                              placeholder="DD"
                              value={editRangeEndDay}
                              onChange={e => {
                                setEditRangeEndDay(e.target.value);
                              }}
                              className={styles.miniDateInput}
                            />
                          </div>
                        </div>

                        <div className={styles.formField}>
                          <span className={styles.label}>Czas drugiej granicy (GG:MM:SS)</span>
                          <div className={styles.compactDateTimeInputs}>
                            <select
                              value={editRangeEndTimeQual}
                              onChange={e => {
                                setEditRangeEndTimeQual(e.target.value);
                              }}
                              className={styles.input}
                              style={{ width: 'auto', minWidth: '165px', height: '34px' }}
                            >
                              {QUALIFIER_OPTIONS.map(q => (
                                <option key={q.value} value={q.value}>
                                  {q.label}
                                </option>
                              ))}
                            </select>
                            <div className={styles.timeHmsGroup}>
                              <input
                                type="number"
                                min={0}
                                max={23}
                                placeholder="GG"
                                value={editRangeEndHour}
                                onChange={e => {
                                  setEditRangeEndHour(e.target.value);
                                }}
                                className={styles.miniDateInput}
                              />
                              <span>:</span>
                              <input
                                type="number"
                                min={0}
                                max={59}
                                placeholder="MM"
                                value={editRangeEndMinute}
                                onChange={e => {
                                  setEditRangeEndMinute(e.target.value);
                                }}
                                className={styles.miniDateInput}
                              />
                              <span>:</span>
                              <input
                                type="number"
                                min={0}
                                max={59}
                                placeholder="SS"
                                value={editRangeEndSecond}
                                onChange={e => {
                                  setEditRangeEndSecond(e.target.value);
                                }}
                                className={styles.miniDateInput}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.55rem',
                }}
              >
                <span className={styles.label}>{personLabels.sectionTitle}</span>
                <div className={styles.personLinksGrid}>
                  <div className={styles.formField}>
                    <span className={styles.label}>Rodzaj powiązania</span>
                    <select
                      value={linkRoleType}
                      onChange={e => {
                        setLinkRoleType(e.target.value as 'DEPICTED' | 'RELATED' | 'AUTHOR');
                      }}
                      className={styles.input}
                    >
                      <option value="DEPICTED">{personLabels.depictedOption}</option>
                      <option value="RELATED">{personLabels.relatedOption}</option>
                      <option value="AUTHOR">{personLabels.authorOption}</option>
                    </select>
                  </div>

                  <div className={styles.formField}>
                    <span className={styles.label}>Dodaj osobę z drzewa</span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        type="text"
                        placeholder="Szukaj w drzewie..."
                        value={linkPersonQuery}
                        onChange={e => {
                          setLinkPersonQuery(e.target.value);
                        }}
                        className={styles.input}
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
                  </div>

                  <div className={styles.formField}>
                    <span className={styles.label}>Lub wpisz osobę tekstowo</span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        type="text"
                        placeholder="np. Fotograf z Lublina"
                        value={linkTextInput}
                        onChange={e => {
                          setLinkTextInput(e.target.value);
                        }}
                        className={styles.input}
                      />
                      <select
                        value={linkTextSex}
                        onChange={e => {
                          setLinkTextSex(e.target.value as PersonSex);
                        }}
                        className={styles.input}
                        style={{ width: '75px' }}
                      >
                        <option value="MALE">M</option>
                        <option value="FEMALE">K</option>
                        <option value="UNKNOWN">?</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (linkTextInput.trim() === '') return;
                          const txt = linkTextInput.trim();
                          setEditPersonLinks(prev => [
                            ...prev,
                            {
                              personText: txt,
                              personSex: linkTextSex,
                              linkType: linkRoleType,
                              displayLabel: `${roleBadgeForType(linkRoleType)}: ${txt} [spoza bazy]`,
                            },
                          ]);
                          setLinkTextInput('');
                        }}
                        className={styles.btnSecondary}
                      >
                        + Dodaj
                      </button>
                    </div>
                  </div>
                </div>

                {linkPersonResults.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {linkPersonResults.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          const fullName = `${p.givenName ?? ''} ${p.surname ?? ''}`.trim();
                          setEditPersonLinks(prev => [
                            ...prev,
                            {
                              personId: p.id,
                              linkType: linkRoleType,
                              displayLabel: `${roleBadgeForType(linkRoleType)}: ${fullName}`,
                            },
                          ]);
                          setLinkPersonResults([]);
                          setLinkPersonQuery('');
                        }}
                        className={styles.btnSecondary}
                      >
                        + Wybierz: {p.givenName} {p.surname} ({p.birthYear ?? '?'})
                      </button>
                    ))}
                  </div>
                )}

                {editPersonLinks.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {editPersonLinks.map((pl, idx) => (
                      <span
                        key={`${pl.displayLabel}-${String(idx)}`}
                        className={styles.selectedFilesBadge}
                      >
                        {pl.displayLabel}{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setEditPersonLinks(prev => prev.filter((_, i) => i !== idx));
                          }}
                          style={{
                            marginLeft: '0.35rem',
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            fontWeight: 800,
                          }}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.32rem' }}>
              {activeItem.title && (
                <strong style={{ fontSize: '1rem' }}>{activeItem.title}</strong>
              )}
              {activeItem.dateText && (
                <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#1e293b' }}>
                  📅 Data i czas wykonania: {activeItem.dateText}
                </div>
              )}
              {activeItem.inscriptionText && (
                <div style={{ fontSize: '0.84rem', color: '#1e293b', fontStyle: 'italic' }}>
                  ✍️ Podpis z odwrotu: „{activeItem.inscriptionText}”
                </div>
              )}
              {activeItem.description && (
                <div style={{ fontSize: '0.84rem', color: '#334155', whiteSpace: 'pre-wrap' }}>
                  📝 Opis: {activeItem.description}
                </div>
              )}
              {activeItem.sourceText && (
                <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                  📚 Źródło: <strong>{activeItem.sourceText}</strong>
                </div>
              )}
              {activeItem.authors && activeItem.authors.length > 0 && (
                <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                  {personLabels.authorSummary}{' '}
                  <strong>{activeItem.authors.map(a => a.displayName).join(', ')}</strong>
                </div>
              )}
              {activeItem.depictedPersons && activeItem.depictedPersons.length > 0 && (
                <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                  {personLabels.depictedSummary}{' '}
                  <strong>{activeItem.depictedPersons.map(d => d.displayName).join(', ')}</strong>
                </div>
              )}
              {activeItem.relatedPersons && activeItem.relatedPersons.length > 0 && (
                <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                  🔗 Osoby powiązane:{' '}
                  <strong>{activeItem.relatedPersons.map(r => r.displayName).join(', ')}</strong>
                </div>
              )}
              {activeItem.collectionNames && activeItem.collectionNames.length > 0 && (
                <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                  📦 Kolekcje: <strong>{activeItem.collectionNames.join(', ')}</strong>
                </div>
              )}
              {isAdmin && activeItem.metadataDateText && (
                <div className={styles.metadataBadge} style={{ alignSelf: 'flex-start' }}>
                  📷 Data z metadanych — {activeItem.metadataDateSource ?? 'Metadane'}:{' '}
                  <strong>{activeItem.metadataDateText}</strong>
                </div>
              )}
              <div className={styles.breakableCode}>
                Nazwa pliku:{' '}
                {activeSelectedVersion ? activeSelectedVersion.fileName : activeItem.fileName}
              </div>
              {isAdmin && activeItem.relativePath && (
                <div className={styles.breakableCode}>
                  Ścieżka na dysku (widoczna dla administratora):{' '}
                  {activeSelectedVersion?.relativePath ?? activeItem.relativePath}
                </div>
              )}
            </div>
          )}

          {isAdmin && showVersionUpload && (
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '0.85rem',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: '0.65rem',
              }}
            >
              <div className={styles.formField} style={{ flex: '1 1 200px' }}>
                <span className={styles.label}>
                  {activeItem.mediaType === 'IMAGE'
                    ? 'Typ wersji / strony zdjęcia'
                    : activeItem.mediaType === 'VIDEO'
                      ? 'Typ wersji filmu'
                      : 'Typ wersji nagrania audio'}
                </span>
                <select
                  value={versionTypeInput}
                  onChange={e => {
                    setVersionTypeInput(e.target.value);
                  }}
                  className={styles.input}
                >
                  {versionOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formField} style={{ flex: '1 1 180px' }}>
                <span className={styles.label}>Własna etykieta (opcjonalnie)</span>
                <input
                  type="text"
                  placeholder="np. Koloryzacja z 2025 r."
                  value={versionLabelInput}
                  onChange={e => {
                    setVersionLabelInput(e.target.value);
                  }}
                  className={styles.input}
                />
              </div>
              <div className={styles.filePickerRow}>
                <label htmlFor={versionFileInputId} className={styles.filePickerLabel}>
                  📂 Wybierz plik wersji
                </label>
                <input
                  id={versionFileInputId}
                  type="file"
                  accept={
                    activeItem.mediaType === 'VIDEO'
                      ? 'video/*'
                      : activeItem.mediaType === 'AUDIO'
                        ? 'audio/*'
                        : 'image/*'
                  }
                  onChange={e => {
                    setVersionFile(e.target.files?.[0] ?? null);
                  }}
                  className={styles.hiddenFileInput}
                />
                <span className={styles.selectedFilesBadge}>
                  {versionFile ? versionFile.name : 'Nie wybrano'}
                </span>
              </div>
              {versionTypeInput !== 'REVERSE' && (
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={versionSetAsMain}
                    onChange={e => {
                      setVersionSetAsMain(e.target.checked);
                    }}
                  />
                  <span>Ustaw jako główną wyświetlaną wersję</span>
                </label>
              )}
              <button
                type="button"
                disabled={!versionFile || isSubmitting}
                onClick={() => {
                  void handleUploadVersionSubmit();
                }}
                className={styles.btnPrimary}
              >
                ✓ Wgraj wersję
              </button>
            </div>
          )}

          {isAdmin &&
            showCropper &&
            personId !== undefined &&
            activeItem.mediaType !== 'AUDIO' && (
              <InteractiveAvatarCropper
                mediaId={activeItem.id}
                mediaType={activeItem.mediaType}
                onSaveCrop={(cx, cy, cz) => {
                  void handleSavePrimaryOrAvatarCrop(cx, cy, cz);
                }}
                onCancel={() => {
                  setShowCropper(false);
                }}
              />
            )}

          {isAdmin && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {!isEditingItem ? (
                <>
                  <button
                    type="button"
                    data-testid="start-edit-media-item-button"
                    onClick={() => {
                      void handleStartEditMode();
                    }}
                    className={styles.btnSecondary}
                  >
                    ✏️ Edytuj dane, opis, osoby, autora lub datę
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowVersionUpload(prev => !prev);
                    }}
                    className={styles.btnSecondary}
                  >
                    ➕{' '}
                    {activeItem.mediaType === 'IMAGE'
                      ? 'Dodaj wersję / rewers'
                      : 'Dodaj wersję pliku'}
                  </button>
                  {activeSelectedVersion && !activeSelectedVersion.main && (
                    <>
                      {!activeSelectedVersion.reverseSide && (
                        <button
                          type="button"
                          onClick={() => {
                            void handleSetVersionAsMain(activeSelectedVersion.id);
                          }}
                          className={styles.btnSecondary}
                        >
                          ⭐ Ustaw tę wersję jako główną
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setVersionIdToDelete(activeSelectedVersion.id);
                        }}
                        className={styles.btnDanger}
                      >
                        🗑️ Usuń tę wersję
                      </button>
                    </>
                  )}
                  {context === 'PERSON' &&
                    personId !== undefined &&
                    activeItem.mediaType !== 'AUDIO' && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowCropper(prev => !prev);
                        }}
                        className={styles.btnSecondary}
                      >
                        ⭐ Ustaw jako portret / wykadruj kółko
                      </button>
                    )}
                  {context === 'GRAVE' &&
                    graveId !== undefined &&
                    activeItem.mediaType === 'IMAGE' &&
                    primaryMediaId !== activeItem.id && (
                      <button
                        type="button"
                        onClick={() => {
                          void handleSavePrimaryOrAvatarCrop();
                        }}
                        className={styles.btnSecondary}
                      >
                        ⭐ Ustaw jako główne zdjęcie nagrobka
                      </button>
                    )}
                  {(graveId !== undefined ||
                    personId !== undefined ||
                    eventId !== undefined ||
                    collectionId !== undefined) && (
                    <button
                      type="button"
                      onClick={() => {
                        void handleOpenUnlinkModal();
                      }}
                      className={styles.btnSecondary}
                    >
                      🔗 Odepnij z tego miejsca
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteFileConfirm(true);
                    }}
                    className={styles.btnDanger}
                  >
                    🗑️ Usuń całkowicie
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      void handleSaveItemEdit();
                    }}
                    className={styles.btnPrimary}
                  >
                    Zapisz zmiany
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingItem(false);
                    }}
                    className={styles.btnSecondary}
                  >
                    Anuluj
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {isAdmin && showUnlinkConfirm && (
        <div
          className={styles.modalBackdrop}
          style={{ zIndex: 1450 }}
          onClick={e => {
            e.stopPropagation();
            setShowUnlinkConfirm(false);
          }}
        >
          <div
            className={styles.smallConfirmModal}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>
              🔗 Odpiąć plik z tego miejsca?
            </h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }}>
              Czy na pewno chcesz odpiąć plik{' '}
              <strong>„{activeItem.title ?? activeItem.fileName}”</strong> z tej sekcji?
            </p>
            {doesUnlinkRequireTargetCollection() && (
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '0.85rem',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                }}
              >
                <span className={styles.label}>
                  Plik traci ostatnie powiązanie – wskaż kolekcję docelową, do której ma zostać
                  przeniesiony fizycznie na dysku *
                </span>
                <select
                  value={unlinkTargetCollectionId}
                  onChange={e => {
                    setUnlinkTargetCollectionId(e.target.value);
                  }}
                  className={styles.input}
                >
                  <option value="">— Wybierz kolekcję docelową —</option>
                  {availableCollections.map(col => (
                    <option key={col.id} value={String(col.id)}>
                      {col.datedCollection
                        ? `📅 [Album datowany] ${col.name}`
                        : `📦 [Kolekcja] ${col.name}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowUnlinkConfirm(false);
                }}
                className={styles.btnSecondary}
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={
                  isSubmitting ||
                  (doesUnlinkRequireTargetCollection() && unlinkTargetCollectionId === '')
                }
                onClick={() => {
                  void handleConfirmUnlink();
                }}
                className={styles.btnPrimary}
              >
                Tak, odepnij plik
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && showDeleteFileConfirm && (
        <div
          className={styles.modalBackdrop}
          style={{ zIndex: 1450 }}
          onClick={e => {
            e.stopPropagation();
            setShowDeleteFileConfirm(false);
          }}
        >
          <div
            className={styles.smallConfirmModal}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>
              🗑️ Usunąć plik całkowicie?
            </h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }}>
              Czy na pewno chcesz bezpowrotnie usunąć plik{' '}
              <strong>„{activeItem.title ?? activeItem.fileName}”</strong> ze wszystkich sekcji?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteFileConfirm(false);
                }}
                className={styles.btnSecondary}
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  void handleConfirmDeleteFile();
                }}
                className={styles.btnDanger}
              >
                Tak, usuń całkowicie
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && versionIdToDelete !== null && (
        <div
          className={styles.modalBackdrop}
          style={{ zIndex: 1450 }}
          onClick={e => {
            e.stopPropagation();
            setVersionIdToDelete(null);
          }}
        >
          <div
            className={styles.smallConfirmModal}
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>
              🗑️ Usunąć tę wersję pliku?
            </h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }}>
              Czy na pewno chcesz bezpowrotnie usunąć wybraną wersję pliku?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={() => {
                  setVersionIdToDelete(null);
                }}
                className={styles.btnSecondary}
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  void handleConfirmDeleteVersion();
                }}
                className={styles.btnDanger}
              >
                Tak, usuń wersję
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}