# Creating a New Admin User

Use the `createAdmin.js` script to add a new administrator account directly from the command line — useful for initial setup or recovery when the UI is unavailable.

## Usage

```bash
node src/setup/createAdmin.js \
  --email=user@example.com \
  --password=YourPassword123 \
  --name=FirstName \
  --surname=LastName
```

Or via the npm shortcut:

```bash
npm run create-admin -- --email=user@example.com --password=YourPassword123 --name=FirstName --surname=LastName
```

## Parameters

| Parameter   | Required | Description                     |
|-------------|----------|---------------------------------|
| `--email`   | Yes      | Login email for the new admin   |
| `--password`| Yes      | Password (minimum 8 characters) |
| `--name`    | No       | First name (defaults to `Admin`)|
| `--surname` | No       | Last name (defaults to empty)   |

## Notes

- The script will refuse to create a duplicate — if an admin with that email already exists it exits with an error.
- Requires the database to be reachable. Make sure `.env` or `.env.local` contains a valid `DATABASE` connection string before running.
- All new accounts are created with `enabled: true` and `role: owner`.

## Example

```bash
npm run create-admin -- --email=info@techhubmall.com --password=TechHub2024! --name=TechHub --surname=Mall
```

## Creating admins from the UI

You can also create admins without the CLI via **Settings → Administrators** in the web app.
