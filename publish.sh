#!/bin/bash
set -e

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Set up a cleanup function to be triggered upon script exit
__cleanup ()
{
    SIGNAL=$1

    if [ "$(git rev-parse --abbrev-ref HEAD)" != "$ORIGINAL_BRANCH" ]; then
       # reset unstaged changes and get rid of them
      git reset .
      git clean -xfd
      
      # reset back to original branch
      git checkout "$ORIGINAL_BRANCH"
    fi
   
    # when this function was called due to receiving a signal
    # disable the previously set trap and kill yourself with
    # the received signal
    if [ -n "$SIGNAL" ]
    then
        trap $SIGNAL
        kill -${SIGNAL} $$
    fi
}

trap '__cleanup 1' HUP
trap '__cleanup 2' INT
trap '__cleanup 3' QUIT
trap '__cleanup 13' PIPE
trap '__cleanup 15' TERM

# Store the current latest commit SHA
SHA=$(git rev-parse HEAD)

if ! git diff-index --quiet HEAD --; then
  echo "Error: You need to be on a clean branch to publish. Please commit or stash your changes."
  exit 1
fi

# Build and pack
npm i
npm run build
TARBALL=$(npm pack | tail -n1)
TMPDIR=$(mktemp -d)
mv "$TARBALL" "$TMPDIR/"
TARBALL="$TMPDIR/$TARBALL"
echo "Tarball: $TARBALL"

# Check for the presence of the "$ORIGINAL_BRANCH-builds" branch
if git show-ref --quiet "refs/heads/$ORIGINAL_BRANCH-builds"; then
  git checkout "$ORIGINAL_BRANCH-builds"
else
  git checkout --orphan "$ORIGINAL_BRANCH-builds"
fi

# untar the tarball, then unstage and delete it
tar -xzf "$TARBALL" -C .
rm "$TARBALL"

# Move contents of package to current directory
rm -rf ./lib ./node_modules ./.cache ./test ./.gitignore
mv -f ./package/* .
rm -rf ./package

# Add, commit, push
git add .
git commit -m "(${ORIGINAL_BRANCH}) build from commit $SHA"
git push origin "$ORIGINAL_BRANCH-builds"

echo "🚀 pushed build branch '$ORIGINAL_BRANCH-builds' at commit: $(git rev-parse HEAD)"

# reset back to original branch
git checkout "$ORIGINAL_BRANCH"
npm i
