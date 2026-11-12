# termcord

Discord in your terminal. The whole four-pane interface (server rail, channel list, chat, member list) drawn with
truecolor ANSI, in plain Node with **zero dependencies**.

![termcord running the demo](docs/screenshot.png)

## Run it

Requires Node 22 or newer. Nothing to install.

```sh
node src/index.js --demo      # offline sample servers with simulated activity
```

To connect to real servers, create a bot application and pass its token:

```sh
DISCORD_TOKEN=your-bot-token node src/index.js
```

1. Create an application at <https://discord.com/developers/applications> and add a bot.
2. Under **Bot → Privileged Gateway Intents**, enable **Message Content**, **Server Members** and **Presence**.
   termcord still works without them, but message text, the member list and online status are then limited.
3. Invite the bot to your server with the `bot` scope and the View Channels, Send Messages, Read Message History and
   Add Reactions permissions.

termcord signs in as a **bot account** through Discord's official API. It deliberately does not accept personal
account tokens: automating a user account is against Discord's Terms of Service and gets accounts banned.

## What is in the interface

- Server rail with the active pill, unread dots and mention badges, plus a Direct Messages home
- Channel list with collapsible categories, text / announcement / voice channels, people connected to voice, and
  the user panel
- Chat with avatars, grouped messages, day and NEW dividers, replies, edits, reactions, embeds, attachments,
  mention highlighting and system messages
- Discord markdown: bold, italic, underline, strikethrough, inline code, code blocks, quotes, lists, headings,
  spoilers (revealed when the message is selected), links, user / role / channel mentions
- Member list grouped by hoisted role and presence, with profile popups
- Composer with multi-line input, drafts per channel, `@` / `#` / `:emoji:` autocomplete and typing indicators
- Quick switcher, infinite scroll through history, mouse support, and a layout that adapts to the window size

## Keys

| Key | Action |
| --- | --- |
| `Tab` / `Shift+Tab` | Cycle focus between servers, channels, messages, composer and members |
| `Ctrl+K` | Quick switcher |
| `Alt+↑` / `Alt+↓` | Previous / next channel |
| `Ctrl+Alt+↑` / `Ctrl+Alt+↓` | Previous / next server |
| `Ctrl+U` | Toggle the member list |
| `Enter` / `Alt+Enter` | Send / new line |
| `↑` in an empty composer | Select messages, then `r` reply, `e` edit, `d` delete, `+` react |
| `PgUp` / `PgDn` | Scroll history |
| `Esc` | Cancel reply or edit, close popups, jump to present |
| `F1` | Shortcut help |
| `Ctrl+C` / `Ctrl+Q` | Quit |

Clicking servers, channels, messages and members works too, and the wheel scrolls the pane under the pointer.

## Not supported yet

Voice and video, threads and forum posts, file uploads, slash commands, and server settings. Voice channels are
listed and their text chat works, but you cannot join them. Read state is tracked locally because bots have no
server-side read markers.

## Development

```sh
npm test                                   # node --test, no install needed
node src/index.js --snapshot 120x36        # print one frame as plain text
```

`src/screen.js` is the cell buffer and ANSI writer, `src/view.js` draws the panes, `src/app.js` holds UI state and
input handling, and `src/backends/` contains the Discord gateway/REST client and the offline demo.
