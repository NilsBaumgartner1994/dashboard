# Flows

## TODO:

- Need a nice import and export feature for flows in the future. Currently we will list all flows
  needed to be created here
- Make "parsing_status" use everywhere same values not like for "Utilization"

## Foods flows

- Sidebar --> Settings --> Flows
- Create a new directus flow
- Trigger Setup --> `Configure as Schedule (CRON)`
  - every 5 minutes: `*/5 * * * *`
- Create a operation --> `Update Data`
- Collection: `App Settings Foods`
- Permission: `Full Access`
- Emit Events: `true` // in order to trigger the hooks
- Payload : `{ "foods_parsing_status": "start"}`
- Query : ```{ "filter": { "\_and": [] } }

## News flows

- Same as Foods flows but with the following changes:
- every morning at 4:00: `0 4 * * *`
- Payload : `{ "news_parsing_status": "start"}`

# Apartmens/Housing flows

- Same as Foods flows but with the following changes:
- every morning at 4:00: `0 4 * * *`
- Payload : `{ "housing_parsing_status": "start"}`
