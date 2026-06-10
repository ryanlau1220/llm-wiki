#!/bin/bash
# LLM Wiki Project Management Utility
# Usage: ./manage.sh [command] [args]

set -e

# Load environment variables if .env exists
if [ -f .env ]; then
    # Use grep to skip comments and empty lines, then export
    export $(grep -v '^#' .env | xargs)
fi


# Help message
function show_help {
    echo "LLM Wiki Platform Management CLI"
    echo ""
    echo "Usage: ./manage.sh [command]"
    echo ""
    echo "Commands:"
    echo "  check      Run project-wide quality checks (lint, typecheck, build)"
    echo "  test       Run all tests (unit, refactor, and linking suites)"
    echo "  docker     Run local Postgres via Docker Compose (foreground logs)"
    echo "  dev        Start local development environment via Turbo"
    echo "  db-push    Synchronize Drizzle schema to the database"
    echo "  verify-gcp Verify Google Cloud / GEAP model accessibility"
    echo "  verify-keys Verify all configured API keys & dynamic fallback chains"
    echo "  seed       Setup default users and initial knowledge metrics"
    echo "  help       Show this help message"
    echo ""
}

CMD=$1
if [ -z "$CMD" ]; then
    show_help
    exit 0
fi
shift

case $CMD in
    "check")
        echo "🔎 Running project-wide checks..."
        bun run lint
        bun run check
        bun run build
        echo "✅ Quality checks passed."
        ;;
    "verify-gcp")
        echo "☁️ Verifying GCP / Gemini Enterprise Agent Platform configuration..."
        bun run scripts/verify-gcp.ts
        ;;
    "verify-keys")
        echo "🔑 Verifying all configured API keys & dynamic fallback chains..."
        bun run scripts/verify-keys.ts
        ;;
    "test")
        echo "🧪 Running full test suite..."
        echo "--- Unit Tests ---"
        bun run test:unit
        echo "--- Refactor Engine Tests ---"
        bun run test:refactor
        echo "--- Linking Intelligence Tests ---"
        bun run test:linking
        echo "✅ All tests passed."
        ;;
    "docker")
        echo "🐳 Starting local database via Docker Compose..."
        if ! command -v docker >/dev/null 2>&1; then
            echo "❌ docker is not installed or not on PATH."
            exit 1
        fi
        if [ ! -f "infra/docker/docker-compose.yml" ]; then
            echo "❌ Missing infra/docker/docker-compose.yml"
            exit 1
        fi
        docker compose -f infra/docker/docker-compose.yml up
        ;;
    "dev")
        echo "💻 Starting Local Dev Environment..."
        bun run dev
        ;;
    "db-push")
        echo "🔄 Synchronizing database schema..."
        # We use drizzle-kit from the db package
        cd packages/db
        echo "🧩 Ensuring required extensions..."
        bun run src/ensure-extensions.ts
        bunx drizzle-kit push
        cd ../..
        echo "✅ Schema synchronized."
        ;;
    "seed")
        echo "🌱 Seeding default admin user..."
        # We can run the seeder by hitting a script or the API
        # For now, we'll use a direct bun run on the seeder if it exists separately
        # or just notify that API handles it on boot.
        echo "Note: API seeds admin@llmwiki.local / admin123 automatically on boot."
        ;;
    "help")
        show_help
        ;;
    *)
        echo "❌ Unknown command: $CMD"
        show_help
        exit 1
        ;;
esac
