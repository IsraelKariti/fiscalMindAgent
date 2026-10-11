## Purpose

Admin-managed pictures for WhatsApp senders: the app logo, a per-agent-instance icon, their upload, removal and public serving, and the order that decides which picture an agent shows (own icon, else app logo, else built-in default).

## ADDED Requirements

### Requirement: Picture resolution order
The effective picture of an agent instance SHALL be, in this order: the instance's own uploaded icon; else the app logo uploaded by an admin; else the built-in default picture shipped with the application (the petal seal as a PNG). The admin pages SHALL show the effective picture and say which of the three levels it comes from.

#### Scenario: Instance with its own icon
- **WHEN** an instance has an uploaded icon, whether or not an app logo is uploaded
- **THEN** its effective picture is its own icon and the agent page labels it as the agent's own

#### Scenario: Instance without an icon, app logo uploaded
- **WHEN** an instance has no uploaded icon and an admin has uploaded an app logo
- **THEN** its effective picture is the app logo and the agent page labels it as the app logo

#### Scenario: Nothing uploaded
- **WHEN** an instance has no uploaded icon and no app logo is uploaded
- **THEN** its effective picture is the built-in default and the agent page labels it as the default

### Requirement: Admin manages the app logo
An admin SHALL be able to upload the app logo on the admin settings page, see the current one, and remove it to return to the built-in default. The upload SHALL accept PNG and JPEG images up to 2 MB and SHALL reject anything else with a clear error. A new upload SHALL replace the previous app logo, and the previous one SHALL no longer be served. The app logo SHALL NOT change the web application's own tab icon or brand mark. Accountants SHALL NOT be able to change it.

#### Scenario: Upload the app logo
- **WHEN** an admin uploads a 300 KB PNG as the app logo
- **THEN** the settings page shows it as the current app logo and every agent page without an own icon shows it as the effective picture

#### Scenario: Remove the app logo
- **WHEN** an admin removes the app logo
- **THEN** the settings page shows the built-in default and every agent page without an own icon shows the built-in default

#### Scenario: Rejected app logo file
- **WHEN** an admin uploads a PDF, an SVG, or an image larger than 2 MB as the app logo
- **THEN** the upload is refused with an error naming the accepted formats and size, and the current app logo stays

### Requirement: Admin uploads an icon for an agent instance
An admin SHALL be able to upload an icon for one agent instance from that agent's page in the admin panel, with the same format and size rules as the app logo. A new upload SHALL replace the instance's previous icon, and the previous icon SHALL no longer be served. Accountants SHALL NOT be able to change the icon.

#### Scenario: Valid PNG upload
- **WHEN** an admin uploads a 300 KB PNG for an agent instance
- **THEN** the icon is stored, the agent page shows it as the current icon, and the admin listing of that accountant's agents returns a URL for it

#### Scenario: Replace an existing icon
- **WHEN** an admin uploads a new JPEG for an instance that already has an icon
- **THEN** the new icon becomes current, its URL differs from the previous one, and a request to the previous URL returns not found

#### Scenario: Rejected icon file
- **WHEN** an admin uploads a PDF, an SVG, or an image larger than 2 MB
- **THEN** the upload is refused with an error naming the accepted formats and size, and the instance keeps its previous icon (or none)

#### Scenario: Non-admin caller
- **WHEN** a signed-in accountant calls any upload or removal endpoint
- **THEN** the request is refused like every other admin-only endpoint and nothing changes

### Requirement: Admin removes an agent icon
An admin SHALL be able to remove an instance's icon, after which the instance falls back to the app logo or the built-in default.

#### Scenario: Remove the icon
- **WHEN** an admin removes the icon of an instance that has one
- **THEN** the stored icon is deleted, the admin listing returns no own icon for it, and the agent page shows the app logo or the built-in default as the effective picture

#### Scenario: Remove when none is set
- **WHEN** an admin removes the icon of an instance that has none
- **THEN** the call succeeds and nothing changes

### Requirement: Pictures are served publicly under unguessable URLs
Every uploaded picture (app logo or agent icon) SHALL be reachable over HTTP without a session, at a URL that cannot be derived from the instance id or from any other known value, so that Meta can fetch it for the WhatsApp profile and the admin pages can preview it. The built-in default SHALL be reachable at a fixed public path. Responses SHALL carry the image's content type and SHALL allow long caching, since every replacement gets a new URL.

#### Scenario: Fetch a current picture without a session
- **WHEN** an unauthenticated client requests the URL of a current uploaded picture
- **THEN** the image bytes are returned with the stored content type

#### Scenario: Unknown or stale URL
- **WHEN** a client requests a picture URL that is not the current app logo nor any instance's current icon
- **THEN** the response is not found
