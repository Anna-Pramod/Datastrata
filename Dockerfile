# The container a hosted pilot runs: the standalone server Next assembles, built
# from a clean checkout on Node 24 and run as an unprivileged user.
#
# It follows scripts/standalone-harness.mjs, the one recipe behind
# `npm run test:standalone` and CI: the same build command, the same standalone
# tree with `.next/static` beside it, and the same `node server.js` started from
# frontend/web. A second way of assembling the artifact would be a second
# definition of "deployable", so wherever this file differs from the harness the
# reason is written beside the line.
#
# Never built or run where it was written: no container runtime is installed
# there, and installing one was not authorised. It was checked by reading it
# against the harness. See frontend/web/README.md, "Container".
#
# Nothing private is in the image, and nothing private is needed to build it.
# DATASTRATA_PILOT_ACCESS_SECRET, DATASTRATA_PILOT_ACCESS_REVOKED_BEFORE,
# DATASTRATA_PUBLIC_ORIGIN and CONTACT_WEBHOOK_URL are read from the server's
# environment at run time, so the host supplies them from its secret store and
# configuration when the container starts. Never pass them as build arguments:
# those are kept in the image's history. A pilot profile, if one is ever served,
# is a file mounted read-only into the container and named by
# DATASTRATA_PILOT_PROFILE; without one, /dashboard renders the synthetic
# development profile, which the build compiles in.
#
# DATASTRATA_PILOT_GATE is the pilot surface's switch, read from the server's
# environment like the rest. Neither this image nor the host sets it, so
# /dashboard, /pilot-access, /login and the two /api/pilot-access routes answer
# 404 and the gate's own variables above are never read. Only a local
# screen-share sets it, to exactly `on` (frontend/web/README.md, "Pilot access").

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
# Node 24.19.0 on Debian bookworm, a glibc system: the lockfile resolves Next's
# compiler and sharp to their glibc builds (`-gnu`, `libc: glibc`). Pinned by
# the tag's multi-arch index digest, read from Docker Hub on 2026-10-22; the tag
# is there for the reader, the digest is what is pulled. Moving it (a new Node
# patch, or a Debian security rebuild of the same tag) is a deliberate change,
# made by looking the digest up again. Both stages use the same reference.
FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS build

# /app is the repository root here, and stays the root of the tree at run time.
WORKDIR /app

# NODE_ENV is deliberately not `production` in this stage: npm ci would then
# leave out the devDependencies (TypeScript among them) that `next build` needs.
# Left unset, `next build` sets it to production for its own run.
ENV NEXT_TELEMETRY_DISABLED=1

# The versions this image actually built with, in the build log.
RUN node --version && npm --version

# The manifests first, so the dependency layer is reused while only sources change.
COPY package.json package-lock.json ./
COPY frontend/web/package.json frontend/web/package.json
COPY backend/engine/package.json backend/engine/package.json

# --ignore-scripts, as the clean clone and the standalone check are installed: no
# dependency's install script runs, and the build has never needed one.
RUN npm ci --ignore-scripts --no-audit --no-fund

# The rest of the checkout. `.dockerignore` keeps out every node_modules and
# .next, git metadata, docs, env and secret files, *.profile.json files and logs.
COPY . .

# Needs network: the root layout uses next/font/google, so the build downloads
# its three Google fonts and self-hosts them in the output.
RUN npm run build --workspace @datastrata/web

# The two assertions `buildStandalone` makes after the same build, so an image
# cannot be assembled from an artifact the standalone check would refuse. The
# entry point is where the tree mirrors the repository beneath
# outputFileTracingRoot; the hygiene check is the harness's own function, not a
# second copy of its rules, and prints its detail when it refuses.
RUN test -f frontend/web/.next/standalone/frontend/web/server.js \
 && node --input-type=module -e "const { assertArtifactHygiene } = await import('/app/scripts/standalone-harness.mjs'); try { assertArtifactHygiene('/app/frontend/web/.next/standalone'); } catch (error) { console.error(error.message); if (error.detail) console.error(error.detail); process.exit(1); }"

# ---------------------------------------------------------------------------
# Runtime stage
# ---------------------------------------------------------------------------
FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS runtime

# The same absolute path as the build stage. Next writes outputFileTracingRoot,
# the repository root at build time (/app), into server.js's configuration;
# keeping the path the same means nothing in the artifact names a directory that
# does not exist. (The harness runs the artifact from another directory and
# passes, so this is margin, not a known requirement.)
WORKDIR /app

# HOSTNAME is where the server listens: every interface inside the container, so
# a published port reaches it (the harness binds 127.0.0.1 because it is a
# local test). It is not where browsers are sent: the gate's redirects are built
# from DATASTRATA_PUBLIC_ORIGIN.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The standalone tree mirrors the repository beneath outputFileTracingRoot, so
# the server is /app/frontend/web/server.js and the engine's traced knowledge,
# corpus, verification and register files sit under /app/backend/engine, where
# the server looks for them. COPY gives every file to root, so the app cannot
# change its own code or the engine's knowledge. Only the artifact is copied:
# the repository itself is not in this stage, as the harness forbids the server
# to reach it.
COPY --from=build /app/frontend/web/.next/standalone/ /app/

# Next leaves .next/static out of the standalone tree by convention, and every
# page needs it. There is no frontend/web/public/ today; if one is added, copy
# it to /app/frontend/web/public here, as the harness does.
COPY --from=build /app/frontend/web/.next/static/ /app/frontend/web/.next/static/

# .next/cache is the one place Next writes at run time (its image and fetch
# caches), so it alone belongs to the app's user. The check after it fails the
# build if anything else under /app (symbolic links aside) is owned by anyone
# but root, or writable by everyone.
RUN mkdir -p /app/frontend/web/.next/cache \
 && chown -R node:node /app/frontend/web/.next/cache \
 && writable="$(find /app -path /app/frontend/web/.next/cache -prune -o ! -type l \( ! -user root -o -perm -0002 \) -print)" \
 && if [ -n "$writable" ]; then printf 'Writable by the app outside .next/cache:\n%s\n' "$writable" >&2; exit 1; fi

# The `node` user (uid 1000) ships with the base image.
USER node
WORKDIR /app/frontend/web
EXPOSE 3000

# Exec form, so node is PID 1 and receives the stop signal itself; Next's server
# closes on SIGTERM.
CMD ["node", "server.js"]
