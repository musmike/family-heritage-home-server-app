import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  userAssignmentApi,
  type UserPersonAssignmentDto,
} from '../../api/userAssignmentApi';
import { biographyApi } from '../../api/biographyApi';
import Loader from '../../components/Loader/Loader';
import styles from './UsersManagementPage.module.css';
import type { PersonListItemDto } from '../../types/biography';

const translateRoleLabel = (role: 'ADMIN' | 'PRIVILEGED_GUEST' | 'GUEST'): string => {
  switch (role) {
    case 'ADMIN':
      return 'Administrator';
    case 'PRIVILEGED_GUEST':
      return 'Uprzywilejowany gość';
    case 'GUEST':
      return 'Gość (konto uniwersalne)';
  }
};

export default function UsersManagementPage() {
  const [users, setUsers] = useState<UserPersonAssignmentDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state (create or edit)
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [role, setRole] = useState<'ADMIN' | 'PRIVILEGED_GUEST' | 'GUEST'>('PRIVILEGED_GUEST');
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [selectedPersonLabel, setSelectedPersonLabel] = useState<string | null>(null);

  const [personSearchQuery, setPersonSearchQuery] = useState<string>('');
  const [personSearchResults, setPersonSearchResults] = useState<PersonListItemDto[]>([]);

  const loadUsers = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await userAssignmentApi.getAllUsers();
      setUsers(data);
    } catch {
      setErrorMessage('Nie udało się pobrać listy użytkowników.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const resetForm = () => {
    setEditingUserId(null);
    setUsername('');
    setPassword('');
    setRole('PRIVILEGED_GUEST');
    setSelectedPersonId(null);
    setSelectedPersonLabel(null);
    setPersonSearchQuery('');
    setPersonSearchResults([]);
  };

  const handleStartEdit = (u: UserPersonAssignmentDto) => {
    setEditingUserId(u.userId);
    setUsername(u.username);
    setPassword('');
    setRole(u.role);
    setSelectedPersonId(u.personId);
    setSelectedPersonLabel(
      u.personId !== null
        ? `${u.personSurname ?? ''} ${u.personGivenName ?? ''}`.trim()
        : null
    );
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSearchPerson = async () => {
    const page = await biographyApi.listPeople({
      search: personSearchQuery,
      page: 0,
      size: 8,
    });
    setPersonSearchResults(page.content);
  };

  const handleSaveUser = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const payload = {
        username: username.trim(),
        password: password.trim() !== '' ? password : undefined,
        role,
        personId: role === 'GUEST' ? null : selectedPersonId,
      };

      if (editingUserId === null) {
        await userAssignmentApi.createUser(payload);
        setSuccessMessage('Utworzono nowego użytkownika.');
      } else {
        await userAssignmentApi.updateUser(editingUserId, payload);
        setSuccessMessage('Zaktualizowano dane użytkownika.');
      }

      resetForm();
      await loadUsers();
    } catch {
      setErrorMessage(
        'Nie udało się zapisać użytkownika. Sprawdź, czy nazwa użytkownika nie jest zajęta oraz czy podano hasło.'
      );
    }
  };

  const handleDeleteUser = async (userId: number) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await userAssignmentApi.deleteUser(userId);
      setSuccessMessage('Użytkownik został usunięty.');
      await loadUsers();
    } catch {
      setErrorMessage('Nie można usunąć tego konta użytkownika.');
    }
  };

  if (isLoading) {
    return (
      <div className={styles.pageWrapper}>
        <Loader size={42} />
      </div>
    );
  }

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Zarządzanie użytkownikami</h1>
          <p className={styles.pageSubtitle}>
            Twórz konta użytkowników, zarządzaj ich rolami, hasłami oraz przypisuj im odpowiadające osoby z drzewa genealogicznego.
          </p>
        </div>
        <Link to="/" className={styles.btnSecondary}>
          ← Panel główny
        </Link>
      </div>

      {errorMessage && (
        <div role="alert" className={styles.AlertError}>
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div data-testid="user-mgmt-success" className={styles.AlertSuccess}>
          {successMessage}
        </div>
      )}

      {/* Create / Edit Form */}
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>
          {editingUserId === null
            ? 'Dodaj nowego użytkownika'
            : `Edycja użytkownika #${String(editingUserId)}`}
        </h2>

        <form
          onSubmit={e => {
            void handleSaveUser(e);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label htmlFor="mgmt-username" className={styles.label}>
                Nazwa użytkownika
              </label>
              <input
                id="mgmt-username"
                data-testid="mgmt-username-input"
                type="text"
                required
                value={username}
                onChange={e => {
                  setUsername(e.target.value);
                }}
                className={styles.input}
              />
            </div>

            <div className={styles.formField}>
              <label htmlFor="mgmt-password" className={styles.label}>
                {editingUserId === null
                  ? 'Hasło'
                  : 'Nowe hasło (pozostaw puste, by nie zmieniać)'}
              </label>
              <input
                id="mgmt-password"
                data-testid="mgmt-password-input"
                type="password"
                required={editingUserId === null}
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                }}
                className={styles.input}
              />
            </div>

            <div className={styles.formField}>
              <label htmlFor="mgmt-role" className={styles.label}>
                Rola użytkownika
              </label>
              <select
                id="mgmt-role"
                data-testid="mgmt-role-select"
                value={role}
                onChange={e => {
                  const nextRole = e.target.value as
                    | 'ADMIN'
                    | 'PRIVILEGED_GUEST'
                    | 'GUEST';
                  setRole(nextRole);
                  if (nextRole === 'GUEST') {
                    setSelectedPersonId(null);
                    setSelectedPersonLabel(null);
                  }
                }}
                className={styles.select}
              >
                <option value="ADMIN">Administrator (ADMIN)</option>
                <option value="PRIVILEGED_GUEST">
                  Uprzywilejowany gość (PRIVILEGED_GUEST)
                </option>
                <option value="GUEST">Gość uniwersalny (GUEST)</option>
              </select>
            </div>
          </div>

          {role !== 'GUEST' ? (
            <div className={styles.personAssignBox}>
              <div className={styles.label}>
                Przypisana osoba z drzewa genealogicznego:{' '}
                <strong style={{ color: '#0f172a' }}>
                  {selectedPersonId !== null
                    ? `${selectedPersonLabel ?? ''} (#${String(selectedPersonId)})`
                    : 'Brak przypisanej osoby'}
                </strong>
              </div>

              <div className={styles.searchRow}>
                <input
                  type="text"
                  placeholder="Wyszukaj osobę po nazwisku lub imieniu..."
                  value={personSearchQuery}
                  onChange={e => {
                    setPersonSearchQuery(e.target.value);
                  }}
                  className={styles.input}
                  style={{ flex: 1, minWidth: '200px' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    void handleSearchPerson();
                  }}
                  className={styles.btnSecondary}
                >
                  Szukaj osoby
                </button>
                {selectedPersonId !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPersonId(null);
                      setSelectedPersonLabel(null);
                    }}
                    className={styles.btnSecondary}
                  >
                    Odepnij osobę
                  </button>
                )}
              </div>

              {personSearchResults.length > 0 && (
                <div className={styles.searchResults}>
                  {personSearchResults.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedPersonId(p.id);
                        setSelectedPersonLabel(
                          `${p.surname ?? ''} ${p.givenName ?? ''}`.trim()
                        );
                        setPersonSearchResults([]);
                      }}
                      className={styles.btnSecondary}
                    >
                      ✓ Wybierz: {p.surname} {p.givenName} ({p.birthYear ?? '?'})
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className={styles.pageSubtitle}>
              Konto z rolą <strong>Gość (GUEST)</strong> jest uniwersalne – nie przypisuje się do niego konkretnej osoby z drzewa.
            </p>
          )}

          <div className={styles.formActions}>
            {editingUserId !== null && (
              <button
                type="button"
                onClick={resetForm}
                className={styles.btnSecondary}
              >
                Anuluj edycję
              </button>
            )}
            <button
              type="submit"
              data-testid="mgmt-save-user-button"
              className={styles.btnPrimary}
            >
              {editingUserId === null ? '+ Utwórz użytkownika' : 'Zapisz zmiany'}
            </button>
          </div>
        </form>
      </section>

      {/* Existing Users List */}
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Lista użytkowników ({users.length})</h2>
        <div className={styles.usersList}>
          {users.map(u => (
            <div
              key={u.userId}
              data-testid={`user-row-${u.username}`}
              className={styles.userRow}
            >
              <div>
                <div>
                  <span className={styles.userName}>{u.username}</span>
                  <span className={styles.roleBadge}>{translateRoleLabel(u.role)}</span>
                </div>
                {u.role !== 'GUEST' && (
                  <div className={styles.assignedPersonText}>
                    Przypisana osoba z drzewa:{' '}
                    {u.personId !== null ? (
                      <Link
                        to={`/biographies/${String(u.personId)}`}
                        style={{ fontWeight: 700, color: '#2563eb' }}
                      >
                        {u.personSurname} {u.personGivenName}
                      </Link>
                    ) : (
                      <em>Brak przypisanej osoby</em>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.rowActions}>
                <button
                  type="button"
                  data-testid={`edit-user-${u.username}`}
                  onClick={() => {
                    handleStartEdit(u);
                  }}
                  className={styles.btnSecondary}
                >
                  ✏️ Edytuj
                </button>
                <button
                  type="button"
                  data-testid={`delete-user-${u.username}`}
                  onClick={() => {
                    void handleDeleteUser(u.userId);
                  }}
                  className={styles.btnDanger}
                >
                  🗑️ Usuń
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}