# Object Store Service

A file-system based object store with RESTful API, supporting both JSON and binary resources with MIME type inference and multi-level path hierarchy.

## Software Design

### Architecture

```
Client (HTTP) ──▶ Server (Hono) ──▶ Store (FileSystem)
                                       │
                                       ▼
                                   data/
                                     ├── robots/
                                     │   ├── robot-a.json
                                     │   ├── firmware.bin
                                     │   └── ...
                                     ├── fleet/
                                     │   ├── alpha/
                                     │   │   ├── config.json
                                     │   │   └── sensors.txt
                                     │   └── beta/
                                     │       └── config.json
                                     └── images/
                                         └── map-floor1.png
```

### Core Concepts

1. **Resource**: Any file stored in the system. A resource is addressed by its path without file extension. The actual file extension is determined by the `Content-Type` header when the resource is created.

2. **Directory**: An implicit container formed when resources share a common path prefix. Directories are created automatically when a nested resource is PUT. They are not standalone entities — they exist because they contain files or sub-directories.

3. **Path**: A slash-separated identifier that maps to a filesystem hierarchy. The URL path `/api/obs/fleet/alpha/config` corresponds to the file `data/fleet/alpha/config.json` (extension inferred from Content-Type).

4. **MIME Type Inference**: When creating a resource, the `Content-Type` header determines the file extension on disk. When reading a resource, the file extension determines the `Content-Type` of the response.

### Conflict Prevention

- A path segment cannot be both a file and a directory. If `robots/robot-a` exists as a file, creating `robots/robot-a/config` will return HTTP 400.
- If `fleet/alpha` exists as a directory (because it has children), creating `fleet/alpha` as a file will return HTTP 400.
- This ensures URL unambiguity — each path resolves to exactly one resource type.

### URL Design

All URLs follow the pattern `/api/obs/:path`, where `:path` is a multi-segment path:

| Operation | Method | URL Pattern | Description |
|-----------|--------|-------------|-------------|
| List root | GET | `/api/obs` | List top-level entries |
| List directory | GET | `/api/obs/:dir` | List children of a directory |
| Get file | GET | `/api/obs/:path` | Get file content with correct Content-Type |
| Create new | POST | `/api/obs/:path` | Create resource (409 if exists) |
| Create or replace | PUT | `/api/obs/:path` | Upsert resource |
| Delete | DELETE | `/api/obs/:path` | Delete file or recursively delete directory |

### MIME Type Mapping

| MIME Type | Extension |
|-----------|-----------|
| `application/json` | `.json` |
| `image/png` | `.png` |
| `image/jpeg` | `.jpg` |
| `image/gif` | `.gif` |
| `image/svg+xml` | `.svg` |
| `image/webp` | `.webp` |
| `application/pdf` | `.pdf` |
| `text/plain` | `.txt` |
| `text/html` | `.html` |
| `text/css` | `.css` |
| `text/csv` | `.csv` |
| `text/yaml` | `.yaml` |
| `text/markdown` | `.md` |
| `application/xml` | `.xml` |
| `application/zip` | `.zip` |
| `application/x-tar` | `.tar` |
| `application/gzip` | `.gz` |
| `application/octet-stream` | `.bin` |
| `video/mp4` | `.mp4` |
| `audio/mpeg` | `.mp3` |
| `audio/wav` | `.wav` |
| Other | `.bin` (fallback) |

### Storage Layer

The `store.ts` module provides the following API:

- `configure(dir: string)` — Set the base data directory
- `list(pathParts: string[])` — List children of a directory
- `get(pathParts: string[])` — Get a resource (directory listing or file content)
- `exists(pathParts: string[])` — Check if a resource exists
- `put(pathParts: string[], data: Buffer, contentType: string)` — Create or update a file resource
- `remove(pathParts: string[])` — Delete a resource (recursive for directories)
- `getExtension(mimeType: string)` — Get file extension from MIME type
- `getMimeType(ext: string)` — Get MIME type from file extension

### Name Validation

Path segment names must match `^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$`:
- Must start with an alphanumeric character, underscore, or hyphen
- Can contain letters, digits, underscores, hyphens, and dots
- `.` and `..` are explicitly disallowed
- Names with spaces or special characters are rejected

---

## Usage

### Starting the Server

```bash
# Install dependencies
npm install

# Start with default settings (port 30000, data dir ./data)
npm start

# Custom port and data directory
npx tsx server.ts --port 8080 --data-dir /tmp/my-data

# Short options
npx tsx server.ts -p 8080 -d /tmp/my-data
```

### Command-Line Options

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--port` | `-p` | `30000` | Server listen port |
| `--data-dir` | `-d` | `./data` | Base directory for file storage |

### API Examples

#### Create a JSON Resource

```bash
curl -X PUT http://localhost:30000/api/obs/robots/robot-a \
  -H "Content-Type: application/json" \
  -d '{"name": "Robot-A", "model": "X100"}'
```

Response (200):
```json
{
  "name": "robot-a",
  "type": "file",
  "contentType": "application/json",
  "size": 42
}
```

#### Create with POST (reject if exists)

```bash
curl -X POST http://localhost:30000/api/obs/robots/robot-b \
  -H "Content-Type: application/json" \
  -d '{"name": "Robot-B", "model": "X200"}'
```

Response (201):
```json
{
  "name": "robot-b",
  "type": "file",
  "contentType": "application/json",
  "size": 42
}
```

If the resource already exists, returns 409:
```json
{"error": "Resource already exists"}
```

#### Upload a Binary File

```bash
curl -X PUT http://localhost:30000/api/obs/robots/firmware \
  -H "Content-Type: application/octet-stream" \
  --data-binary @firmware-v2.bin
```

Response (200):
```json
{
  "name": "firmware",
  "type": "file",
  "contentType": "application/octet-stream",
  "size": 1048576
}
```

#### Upload an Image

```bash
curl -X PUT http://localhost:30000/api/obs/images/map-floor1 \
  -H "Content-Type: image/png" \
  --data-binary @floor1.png
```

#### List Directory Contents

```bash
curl http://localhost:30000/api/obs/robots
```

Response (200):
```json
[
  {"name": "robot-a", "type": "file", "contentType": "application/json", "size": 42},
  {"name": "robot-b", "type": "file", "contentType": "application/json", "size": 56},
  {"name": "firmware", "type": "file", "contentType": "application/octet-stream", "size": 1048576}
]
```

#### Get a Resource

```bash
# JSON resource — returns JSON
curl http://localhost:30000/api/obs/robots/robot-a

# Binary resource — returns raw bytes with correct Content-Type
curl http://localhost:30000/api/obs/robots/firmware --output firmware.bin
```

#### Create Nested Resources

```bash
curl -X PUT http://localhost:30000/api/obs/fleet/alpha/config \
  -H "Content-Type: application/json" \
  -d '{"mode": "auto", "speed": 100}'

curl -X PUT http://localhost:30000/api/obs/fleet/alpha/sensors \
  -H "Content-Type: text/plain" \
  -d 'LIDAR,CAMERA,IMU'
```

The directory `fleet/alpha/` is created automatically. Listing it:

```bash
curl http://localhost:30000/api/obs/fleet/alpha
```

Response:
```json
[
  {"name": "config", "type": "file", "contentType": "application/json", "size": 30},
  {"name": "sensors", "type": "file", "contentType": "text/plain", "size": 16}
]
```

#### Delete a File Resource

```bash
curl -X DELETE http://localhost:30000/api/obs/robots/robot-b
```

Response: 204 No Content

#### Recursively Delete a Directory

```bash
curl -X DELETE http://localhost:30000/api/obs/fleet/alpha
```

This deletes the `alpha/` directory and ALL its children (`config`, `sensors`, and any nested sub-directories). Returns 204 on success.

#### Change Content-Type

PUT the same path with a different Content-Type to replace the file and change its extension:

```bash
# Initially create as JSON
curl -X PUT http://localhost:30000/api/obs/test/data \
  -H "Content-Type: application/json" \
  -d '{"value": 42}'

# Replace with plain text
curl -X PUT http://localhost:30000/api/obs/test/data \
  -H "Content-Type: text/plain" \
  -d 'value=42'
```

The old `data.json` file is removed and `data.txt` is created.

---

## Test Cases

Run the integration test suite:

```bash
npm test

# With a custom port
npx tsx test.ts 8080
```

The test suite starts a server instance, executes all test cases, then cleans up.

### Test Coverage

| # | Category | Test Cases |
|---|----------|------------|
| 1 | **PUT — Create JSON resources** | Create JSON resource, verify name/type/contentType in response; Create second JSON resource |
| 2 | **POST — Create with conflict check** | POST new resource returns 201; POST existing resource returns 409 |
| 3 | **LIST — Directory listing** | GET directory returns 200; Response is array; Correct count; Contains all created names |
| 4 | **GET — JSON resource** | Get existing returns 200 with correct Content-Type and body; Get nonexistent returns 404 |
| 5 | **PUT — Update existing** | PUT existing resource returns 200; Name preserved; Content updated; New fields added |
| 6 | **Binary file support** | PUT binary with `application/octet-stream`; Verify size; GET returns correct Content-Type and byte length |
| 7 | **MIME type inference** | PUT PNG resource with `image/png` → stored as `.png`; PUT text with `text/plain` → stored as `.txt`; GET returns correct Content-Type headers |
| 8 | **Content-Type change** | PUT resource as JSON; PUT same path as text/plain; Old file removed, new file created; GET returns new Content-Type |
| 9 | **DELETE — File resource** | DELETE existing returns 204; DELETE nonexistent returns 404; List count decremented |
| 10 | **Multi-level paths** | PUT `fleet/alpha/config` (2-level); PUT `fleet/alpha/sensors` (2-level); PUT `fleet/beta/config` (2-level); List `fleet` shows `alpha` and `beta` as directories; List `fleet/alpha` shows `config` and `sensors`; GET nested resources returns correct content |
| 11 | **Recursive directory delete** | DELETE directory returns 204; Directory 404 after deletion; Nested children 404 after deletion; Sibling resources unaffected |
| 12 | **File/directory conflict** | PUT file where directory exists → 400; PUT nested where parent is a file → 400 |
| 13 | **Root listing** | GET `/api/obs` returns 200 with array |
| 14 | **Cross-resource isolation** | Operations on one resource type do not affect others |
| 15 | **Resource name validation** | Reject names with spaces (400); Reject path traversal `..` (400) |

### Error Responses

| Status | Condition |
|--------|-----------|
| 400 | Invalid resource name, path traversal, file/directory conflict, empty path for PUT/POST/DELETE |
| 404 | Resource not found (GET or DELETE) |
| 409 | Resource already exists (POST only) |
