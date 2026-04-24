# Figma LLM Bridge

기획자가 자연어로 화면 설계를 지시하면 LLM이 Figma에 직접 스토리보드 초안을 생성하는 WebSocket + MCP 브릿지.

## Architecture

```
┌─────────┐  stdio   ┌──────────────────┐  WebSocket   ┌───────────────┐  postMessage  ┌──────────┐
│   LLM   │ ◄──────► │     Server       │ ◄──────────► │ Plugin UI     │ ◄───────────► │ code.ts  │
│ (Claude │          │ (MCP + WS Bridge)│  :3055       │ (ui.html)     │               │ (Figma   │
│  etc.)  │          └──────────────────┘              └───────────────┘               │  API)    │
└─────────┘                                                                            └──────────┘
```

- **Server**: MCP 서버 (stdio) + WebSocket 서버 (:3055) 를 한 프로세스로 실행
- **Plugin**: Figma 앱 내에서 실행. UI iframe이 WebSocket으로 서버에 연결, 받은 명령을 Plugin API로 실행

## MCP Tools

| Tool | Description |
|------|-------------|
| `create_node` | Rectangle, Ellipse, Frame, Text, Line, Component 생성 |
| `read_node` | ID 또는 이름으로 노드 조회 |
| `read_node_children` | 노드와 하위 자식 노드를 재귀적으로 조회 |
| `update_node` | 노드 속성 수정 (위치, 크기, 색상, 텍스트 등) |
| `delete_node` | 노드 삭제 |
| `get_selection` | 현재 선택된 노드 조회 |
| `get_page_nodes` | 현재 페이지의 최상위 노드 목록 |

## 사전 요구사항

- Node.js >= 18
- Figma 데스크톱 앱 (플러그인은 데스크톱에서만 개발 모드로 로드 가능)
- 해당 Figma 파일에 편집 권한

## 환경 세팅

### Step 1. 의존성 설치

프로젝트 루트에서 실행하면 `server`와 `plugin` 워크스페이스 의존성이 모두 설치된다.

```bash
npm install
```

### Step 2. 빌드

```bash
# 전체 빌드 (server + plugin)
npm run build

# 또는 개별 빌드
npm run build:server   # server/dist/ 에 JS 출력
npm run build:plugin   # plugin/dist/ 에 code.js, ui.html, manifest.json 출력
```

빌드 결과물:

```
server/dist/
  ├── index.js          ← MCP 서버 엔트리포인트
  ├── mcp-server.js
  ├── ws-bridge.js
  └── types.js

plugin/dist/
  ├── manifest.json     ← Figma가 읽는 플러그인 매니페스트
  ├── code.js           ← 플러그인 메인 코드
  └── ui.html           ← WebSocket 브릿지 UI
```

### Step 3. Figma에 플러그인 등록

1. **Figma 데스크톱 앱** 실행
2. 아무 파일이나 열기
3. 상단 메뉴 → `Plugins` → `Development` → `Import plugin from manifest...`
4. 파일 선택 다이얼로그에서 `plugin/dist/manifest.json` 선택
5. 등록 완료 — 이후 `Plugins` → `Development` 목록에 **Figma LLM Bridge** 가 표시됨

> **참고**: `manifest.json`의 `networkAccess.devAllowedDomains`에 `ws://localhost:3055`가 설정되어 있어, 개발 모드에서만 로컬 WebSocket 연결이 허용된다.

### Step 4. MCP 클라이언트 설정

사용하는 MCP 클라이언트에 따라 설정 파일에 아래 내용을 추가한다.

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/figma-llm-bridge/server/dist/index.js"]
    }
  }
}
```

**OpenCode** (`~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "figma-bridge": {
      "type": "local",
      "command": ["node", "/absolute/path/to/figma-llm-bridge/server/dist/index.js"],
      "enabled": true
    }
  }
}
```

> `args`/`command`의 경로는 본인 환경의 절대 경로로 변경할 것.

## 사용 방법

### 1. Figma 플러그인 실행

1. Figma에서 작업할 파일 열기
2. `Plugins` → `Development` → **Figma LLM Bridge** 클릭
3. 플러그인 UI에 **"Connected"** 표시 확인

> "Disconnected" 또는 "Reconnecting in 5s..." 가 표시되면 MCP 서버가 아직 실행되지 않은 상태. MCP 클라이언트를 먼저 시작하거나, 수동으로 서버를 실행한다.

### 2. LLM에게 작업 요청

MCP 클라이언트(Claude Desktop, OpenCode 등)에서 자연어로 Figma 작업을 요청한다.

```
예시:
- "빨간색 사각형을 만들어줘"
- "로그인 화면 스토리보드 초안을 만들어줘"
- "현재 페이지에 있는 노드 목록을 보여줘"
- "선택한 노드의 색상을 파란색으로 바꿔줘"
```

LLM이 MCP 도구를 호출하면 Server → WebSocket → Plugin → Figma API 경로로 명령이 전달되어 Figma 캔버스에 직접 반영된다.

## 개발

```bash
# Server 개발 모드 (tsx watch — 코드 변경 시 자동 재시작)
npm run dev:server

# Plugin 빌드 (코드 수정 후 재빌드 필요)
npm run build:plugin
```

> **주의**: `dev:server`로 수동 실행한 서버가 남아있으면 MCP 클라이언트가 서버를 spawn할 때 포트 충돌이 발생할 수 있다. 서버에 자동 포트 회수 로직이 내장되어 있어 기존 프로세스를 자동으로 종료하고 재시작하지만, 가능하면 수동 서버는 종료 후 MCP 클라이언트를 사용하는 것을 권장한다.

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| 플러그인 UI에 "Disconnected" 표시 | MCP 서버가 실행되지 않음 | MCP 클라이언트 시작 또는 `npm run dev:server` 실행 |
| MCP 클라이언트에서 figma-bridge 연결 실패 | 포트 3055 충돌 | `lsof -i :3055`로 확인 후 기존 프로세스 종료 (자동 회수 로직 내장) |
| "Figma plugin is not connected" 에러 | 플러그인이 실행되지 않았거나 WebSocket 미연결 | Figma에서 플러그인 재실행 후 "Connected" 확인 |
| 플러그인이 목록에 없음 | manifest.json 미등록 | Step 3 참고하여 `plugin/dist/manifest.json` 재등록 |
