### Local Setup

Clone the repository and run on the root folder:

```
pnpm i
pnpm run dev // to run the elk client
```

### Adding a new page
- Create a new page in the pages directory
- Add the page to `NavSide.vue` to show up in the left bar
- Add translaion to en.json

### Timeline
- components > timeline
This component gets timeline from mastodon and publish it in the home page it uses timeline.ts and masto.ts

- composables > timeline.ts
This component filters and reorders the

- composables > masto > masto.ts
This file defines utility functions and types to interact with a Mastodon instance using both the REST and Streaming APIs. It manages authentication, API client creation, and streaming subscriptions.

### Creating a timeline
- new timeline file in components > timeline
- modify timeline.ts
- add function to imports.ts

### Post actions
- post actions are in the file components\status\StatusAction.vue
- the actions are in composables\masto\status.ts

### Corgi logger
- the logging in the cosnsule is happening through the file composables\masto\logger.ts

### Terminating task
netstat -aon | findstr :5314

### translation/langauge
- The langauge/translation related stuff are saved in locales directory

## installation
- to install packages use pnpm

## To-Do
- udpate the StatusActionButton to fix the warnings
- look up getPreferences

## pending
 - created db directory to save the new database
 - created log.js and db.ts in the server directory
 Still no progress with creating the database :(
