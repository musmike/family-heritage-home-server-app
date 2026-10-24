# Sprint Backlog: Sprint 2 (MVP)

*   **Duration:** 2 weeks (4 February 2026 – 22 February 2026)
*   **Version:** 1.0.0 (MVP)

## Sprint Goal

To create a working skeleton of the application (Minimum Viable Product) that allows users to log in, view a basic list of individuals and a graphical family tree, and allows an Administrator to import a GEDCOM file.

---

## Product Backlog Items selected for the Sprint



### User Story E-01-US-01:

As a user, I want to log in using an username and a password so that I can securely access the system.

### Non-Functional Requirement NFR-01:

User passwords must be stored in the database using strong, one-way hashing algorithms (e.g., Argon2, bcrypt).

**Tasks:**
- [X] Implement the UI for the login page, header, footer and sidebar.

---



### User Story E-01-US-02

As an Administrator, I want the system to distinguish between roles (Guest, Privileged Guest, Administrator), so that I can manage data access.


**Tasks:**
- [X] Adjust UI visibility based on user role.
- [X] Add users with predefined roles to the database during deployment.

---



### User Story E-02-US-01

As an Administrator, I want to be able to import a GEDCOM file, so that I can bulk update the family tree data.

**Tasks:**
- [ ] Design a wireframe for the GEDCOM import page.
- [ ] Create an interface for the Administrator to upload the GEDCOM file.
- [ ] Implement the logic to process the GEDCOM file and map the data to database models.

---




### User Story E-02-US-03

As a Guest User, I want to be able to browse a list of all individuals in the database, so that I can quickly find a person of interest.

**Tasks:**
- [ ] Create an API endpoint that returns a list of individuals.
- [ ] Implement the list view in the user interface.

---




### User Story E-02-US-05

As a User, I want to be able to browse a graphical family tree, so that I can understand the relationships between family members.

**Tasks:**
- [ ] Display a basic, interactive family tree.

---




### Technical Task TECH-01

Create backend/frontend structure, configure dev/staging/prod environments, integrate GitOps with ArgoCD, and implement CI/CD pipeline.

**Tasks:**
- [X] Implement dev/staging/prod environments in Kubernetes using k3s, Helm for deployments, and ArgoCD for GitOps-based deployment.
- [X] Implement CI/CD pipeline for automated build, test, and deployment using GitHub Actions.

