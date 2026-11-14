# Family Heritage Home Server App

A self-hosted web application for preserving and exploring a family's history: genealogy with GEDCOM import and smart record matching, biographies, an event timeline, a media gallery, and cemeteries with graves — all behind role-based access.

The project lets you import a family tree from any genealogy program, review how every person and family maps onto existing data before anything is saved, and then browse the result as an interactive ancestor tree enriched with biographies, events, photos and burial places.

---

## Screenshots

| Dashboard | Ancestor Tree |
|:---:|:---:|
| ![Dashboard](docs/screenshots/01-dashboard.png) | ![Family Tree](docs/screenshots/02-family-tree.png) |

| GEDCOM Import Wizard | Person Biography |
|:---:|:---:|
| ![GEDCOM Import](docs/screenshots/03-gedcom-import-review.png) | ![Biography](docs/screenshots/04-biography.png) |

| Events Timeline | Media Gallery |
|:---:|:---:|
| ![Events Timeline](docs/screenshots/05-events-timeline.png) | ![Gallery](docs/screenshots/06-gallery.png) |

| Cemeteries & Graves | Users & Roles |
|:---:|:---:|
| ![Graves](docs/screenshots/07-graves.png) | ![Users and Roles](docs/screenshots/08-users-roles.png) |

---

## Features

### Genealogy & GEDCOM Import
- **Import Wizard:** Upload `.ged` files exported from MyHeritage, Gramps, Ancestry, Family Tree Builder or any GEDCOM-compliant tool. Import runs as a session — nothing is written to the database until the administrator confirms it.
- **Smart Matching Engine:** Every person and family in the file is compared with existing data using the external UID, name similarity (Levenshtein distance), birth/death dates and places, sex, and the given names of parents and spouses. Results are classified as automatic match, needs review, or new, with an explanation of the score.
- **Manual Review:** Override any decision, search the database for a different match, or create a new record, separately for people and families.
- **Absent People Handling:** People missing from a newer file can be archived or deleted, with protection against deleting records that are still referenced.
- **Import History & Restore:** Browse past imports, restore an earlier state, or reset the whole tree.
- **Flexible Genealogical Dates:** Exact, approximate (`ABT`), `BEF`/`AFT`, ranges (`BET…AND`, `FROM…TO`), estimated and calculated dates, normalised for sorting.

### Biographies & Ancestor Tree
- **Interactive Ancestor Tree:** Click any person to see their details, open their biography, or make them the new root of the tree (proband). A default proband can be saved and you can step back through previously viewed people.
- **Person Pages:** Names, life events, parents, spouses, children, linked media and a free-text biography editable by administrators.
- **Avatar Cropper:** Choose a portrait from the gallery and crop and zoom it interactively.
- **User–Person Linking:** Application users can be linked to their own person in the tree.

### Events Timeline
- **Typed Events with Participants:** Events with roles for each participant, hierarchical parent/sub-events and multiple collections.
- **Timeline View:** Events grouped by decade and year, with media attached to each event.

### Media Gallery
- **Upload Pipeline:** Single and batch upload with automatic thumbnail generation and EXIF date extraction.
- **File Versions:** Keep several versions of one file and choose the main one.
- **Collections:** Nested collections, filtering, person tagging and a lightbox viewer.
- **Bulk Operations:** Update metadata, link, unlink, or delete many files at once.
- **Attach Anywhere:** Media can be linked to people, events and graves.

### Cemeteries & Graves
- **Cemeteries and Graves:** Browse graves grouped by cemetery.
- **Burials:** Current and historical burials per grave, with the ability to split a burial.
- **Grave Photos:** Attach photos and set a primary image for each grave.

### Dashboard & Audit Trail
- **Overview:** Statistics about the tree and upcoming anniversaries.
- **Activity Log:** Audit trail of who changed what and when, including logins and imports.

### User Management
- **Admin Panel:** Administrators can create, edit and delete application users and assign each one a role (`ADMIN`, `PRIVILEGED_GUEST` or `GUEST`) from the **Users & Roles** screen.
- **Credentials:** Set or change a user's username and password; passwords are stored as BCrypt hashes.
- **Person Assignment:** Link each user to a person in the family tree, so family members are tied to their own place in it.
- **Server-Side Enforcement:** User management endpoints are admin-only; other roles never see the screen and the API rejects their requests.

### Security & Access Control
- **JWT Authentication:** Access and refresh tokens stored in HttpOnly cookies with transparent token refresh in the browser.
- **CSRF Protection:** Double-submit token verified on every state-changing request.
- **Role-Based Access:** `ADMIN`, `PRIVILEGED_GUEST` and `GUEST` roles; all write operations and the entire GEDCOM import API are admin-only, enforced on the server and mirrored in the UI.
- **Hardened Credentials:** BCrypt password hashing and declarative user provisioning from configuration.
- **Automatic Database Seeding:** The demo stack loads a fictional family on startup and provisions demo users.

### Engineering & Delivery
- **Versioned Schema:** Flyway migrations, Hibernate in `validate` mode.
- **Integration Tests:** 140+ backend tests, many running against a real PostgreSQL via Testcontainers, plus frontend component tests.
- **CI/CD:** GitHub Actions with change-based pipelines, Docker images published to GHCR, Trivy vulnerability scans, and GitOps-based deployment to dev, staging and production.
- **GitOps on Kubernetes:** The pipeline updates the image tag in a separate GitOps repository, and Argo CD deploys the application to a k3s cluster (see [Deployment](#deployment)).

---

## Future Features

- **Memories & Sayings:** A place for family stories, quotes and anecdotes linked to people.
- **Journal:** An administrator-only journal for research notes.
- **Statistics:** Demographic charts such as life expectancy, family size, name popularity and migration.
- **Documents:** Scans of certificates and records with transcriptions and translations.
- **Places:** Dedicated place records with a map view and the people and events tied to each location.
- **Heirlooms:** A catalogue of family keepsakes with photos and their history.
- **Multilingual Interface:** English (and further languages) in addition to Polish, with a language switcher and translated labels, dates and messages.
- **Dark Mode:** A dark theme with automatic detection of the system preference and a manual toggle.
- **Accessibility:** Support for users with disabilities, including full keyboard navigation, screen reader compatibility (ARIA labels and semantic markup), sufficient colour contrast, adjustable text size and visible focus indicators, aiming at WCAG compliance.

---

## Tech Stack

- **Backend:** Java 25, Spring Boot 4, Spring Security (JWT, CSRF), Spring Data JPA, Flyway, gedcom4j
- **Frontend:** React 19, TypeScript, Vite, React Router, Axios, Tailwind CSS
- **Database:** PostgreSQL 15
- **Testing:** JUnit 5, Testcontainers, JaCoCo (Java), Vitest, React Testing Library (React)
- **Deployment:** Docker, Docker Compose, Nginx, GitHub Actions, GHCR, Trivy, Argo CD, k3s

---

## Deployment

The application is designed to run self-hosted. My own instance runs on a home server in a private network, so family data never leaves the local network.

- **Cluster:** k3s (lightweight Kubernetes) on the home server.
- **GitOps:** Kubernetes manifests live in a separate GitOps repository, with one configuration per environment: **dev**, **staging** and **prod**.
- **Argo CD:** Argo CD watches the GitOps repository and syncs each environment to the cluster automatically.
- **Release flow:** a push to GitHub triggers the CI/CD pipeline, which builds and scans the Docker images, publishes them to GHCR, and commits the new image tag to the matching environment in the GitOps repository. Argo CD then rolls out the change.

The Docker Compose setup below is a lightweight way to try the app locally without any of this infrastructure.

---

## Quick Start (Docker)

### Requirements
- [Docker Engine & Docker Compose](https://docs.docker.com/get-docker/)

### 1. Clone the repository
```bash
git clone https://github.com/musmike/family-heritage-home-server-app.git
cd family-heritage-home-server-app
```

### 2. Build and start the services
```bash
docker compose -f docker-compose.demo.yml up --build
```
The first build takes a few minutes while Gradle and npm dependencies are downloaded. When the backend is healthy, a one-shot `seed` container loads the demo data and exits.

### 3. Open in browser
Navigate to [http://localhost:3100](http://localhost:3100).

### Demo Credentials
The database is automatically seeded on startup. Sign in with one of the demo accounts (as `musmike` you can also open the **Users & Roles** screen to manage users):

| Username | Password | Role | Access |
|---|---|---|---|
| `musmike` | `student` | `ADMIN` | Full access: import, editing, uploads, user management |
| `robert` | `student` | `PRIVILEGED_GUEST` | Read-only |
| `john` | `student` | `GUEST` | Read-only |

### Demo Data
A fictional family (17 people, 6 families, 4 generations) from [`demo/demo-family.ged`](demo/demo-family.ged) is imported automatically through the same REST API the import wizard uses, and the youngest person is set as the root of the ancestor tree. If the tree is empty, check the seed job:
```bash
docker compose -f docker-compose.demo.yml logs seed
```


---

## Running Unit Tests

### Backend Tests (JUnit 5 + Testcontainers)
Requires JDK 25 and a running Docker daemon.
```bash
cd backend
./gradlew test
```
The coverage report is generated in `backend/build/reports/jacoco/test/html/index.html`.

### Frontend Tests (Vitest & React Testing Library)
```bash
cd frontend
npm install
npm test
```

---

## Architecture & Ports

| Service | Technology | Port (Host) |
|---|---|---|
| Frontend (`frontend`) | React + Nginx | `http://localhost:3100` |
| Backend API (`backend`) | Spring Boot 4 (context path `/api`) | `http://localhost:8085` |
| Database (`db`) | PostgreSQL 15 | `http://localhost:5432` |
| Seed job (`seed`) | Alpine + curl + jq | one-shot, no port |

All published ports are bound to `127.0.0.1`, so the demo is not reachable from other machines on the network.