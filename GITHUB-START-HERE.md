# Work from the GitHub copy

This repository uses Node 24, Supabase and the original project folders.

On Windows, clone into a NEW folder (do not overwrite your working download):

```powershell
git clone https://github.com/Shailesh7607/Hamro-Nepali-Dairy.git
cd Hamro-Nepali-Dairy
npm ci
code .
```

Keep your local .env and certificate out of Git. The previously uploaded .env
contained a database connection credential. Removing it from the current tree
does not remove it from history or revoke the password. Rotate that credential
before using the application again. Do not suppress a secret-scan finding while
the credential remains valid. History cleanup requires separate coordinated work.

After editing, save the files, open Source Control in VS Code, review and stage
the intended changes using +, then choose Terminal > Run Task >
Dairy: test, commit staged files and push. Enter a description of your update.
The task runs tests, commits staged changes and pushes the current branch.
It never force-pushes. If a push is rejected, fetch and reconcile changes first.
Test output covers your working tree; GitHub retests the actual pushed commit.

Each push and pull request starts the Dairy pipeline: source checks, automated
tests, desktop/mobile browser checks, container build, dependency audit and
redacted Git-history secret scan. See the repository Actions tab for results.
A pipeline file existing does not mean its first run has passed.

Deployment is disabled until hosting, secrets and deployment variables are
configured. See CI-CD.md for the existing staging/production contract. GitHub
Pages cannot run this Node backend. Production deployment remains manual in
the supplied pipeline; staging can be automatic after successful checks.
