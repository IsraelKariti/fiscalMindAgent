## Purpose

How a file a client sent is shown inside the workspace conversation timeline: a chip that carries a visual preview of the file, so a reader can tell documents apart without opening each one.

## ADDED Requirements

### Requirement: Attachment chips carry a visual preview
Every attachment chip in the conversation timeline (a file on a message bubble, and a child file under a `validate_file_split` trace row) SHALL show a thumbnail of the file above the file's name and size. For an image file the thumbnail SHALL be the image itself, scaled down. For a PDF the thumbnail SHALL be a rendering of its first page. The thumbnail SHALL keep the file's proportions inside a fixed preview box, so chips line up and the timeline does not change height when a thumbnail finishes loading. The chip's name line SHALL keep the label it shows today (display name, filename, or the "image" / "PDF document" / "file" wording for a file with a synthetic name), and the size SHALL stay beside it.

#### Scenario: Image sent on WhatsApp
- **WHEN** a client sends a photo of a pay slip and the accountant opens the conversation tab
- **THEN** the message bubble shows a chip with a small picture of the pay slip above the line "תמונה · 90.9 KB"

#### Scenario: PDF sent on WhatsApp
- **WHEN** a client sends "December 1 (55).pdf" and the accountant opens the conversation tab
- **THEN** the chip shows the first page of that PDF above the line "December 1 (55).pdf · 115.9 KB"

#### Scenario: Split child under the trace row
- **WHEN** an admin with the code-steps toggle on views the `validate_file_split` row of a PDF that was cut into two children
- **THEN** each child chip shows the first page of that child (its own pages only) above its label, in page order as today

### Requirement: Files without a preview keep the icon chip
A file whose thumbnail cannot be produced SHALL show the chip as it looks today: a type icon, the label and the size, with no preview box. This covers a type that is not an image or a PDF (for example a spreadsheet), a PDF the browser cannot open (corrupt, password protected), and a file whose bytes cannot be loaded. A thumbnail that fails SHALL NOT show an error inside the chip and SHALL NOT use a browser-native dialog.

#### Scenario: Spreadsheet
- **WHEN** a client sends an xlsx file
- **THEN** its chip shows the file icon, name and size, with no preview box

#### Scenario: Unreadable PDF
- **WHEN** a client sends a password-protected PDF
- **THEN** its chip falls back to the file icon, name and size, and the rest of the conversation renders normally

### Requirement: Previews load lazily and are cached
A thumbnail SHALL be loaded only when its chip comes into (or near) the visible part of the timeline, so opening a long conversation does not download or render every file at once. Once produced, a thumbnail SHALL be reused while the conversation stays open: scrolling away and back, or the timeline re-rendering because a new message arrived, SHALL NOT download or render the file again. While a thumbnail loads, the chip SHALL already reserve the preview box (with a neutral placeholder), so the "follow the latest message" behaviour of the timeline is not disturbed.

#### Scenario: Long conversation
- **WHEN** the accountant opens a conversation with forty files and the view sits at the latest message
- **THEN** only the files near the visible end are fetched for their preview; older ones load as the reader scrolls up to them

#### Scenario: New message arrives
- **WHEN** the reader is looking at a bubble with three loaded previews and a new message arrives
- **THEN** the three previews stay as they are, with no reload or flicker

### Requirement: The chip still opens the viewer and keeps its warnings
Clicking anywhere on the chip, preview included, SHALL open the same file viewer modal as today, and SHALL NOT open the trace step modal when the chip sits under a split row. A chip for a blocked or injection-suspected file SHALL keep its danger border and hover text, with the preview shown inside it. The preview SHALL carry the file's label as its accessible name, and keyboard users SHALL reach and open the chip as today.

#### Scenario: Open from the preview
- **WHEN** the accountant clicks the picture inside a chip
- **THEN** the file viewer modal opens with that file, and nothing else opens

#### Scenario: Suspicious file
- **WHEN** a file's analysis flagged suspected injection
- **THEN** its chip shows the preview inside the red-bordered chip, with the same hover text as today

### Requirement: Other surfaces are unchanged
The "copy conversation" text, the documents tab, the admin conversation viewer, the file viewer modal, and the two-pane step and call modals SHALL show files exactly as they do today.

#### Scenario: Copy conversation
- **WHEN** the accountant presses "copy conversation" on a chat that holds image and PDF messages
- **THEN** the copied text lists the attachments by name, as before, with no preview data
