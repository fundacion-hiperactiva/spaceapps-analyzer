for candidate in $SET_ENV_FILES; do
        if [ -f "$candidate" ]; then
          echo "INFO: running $candidate before docker build"
          chmod +x "$candidate"
          if command -v bash >/dev/null 2>&1; then
            bash "$candidate"
          else
            sh "$candidate"
          fi
        fi
done
