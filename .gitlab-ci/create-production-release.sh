#!/bin/sh
set -eu
export TZ="${VERSION_TIMEZONE:-UTC+3}"

git config --global --add safe.directory "$(pwd)"
git fetch --tags --quiet

year=$(date +%Y)
doy=$(date +%j)
prefix="${year}.${doy}."

existing_number=$(
  git tag --list "${prefix}*" |
    awk -F '.' '{print $3}' |
    sort -nr |
    head -n1
)

if [ -n "${existing_number:-}" ]; then
  next_number=$((existing_number + 1))
else
  next_number=0
fi

new_tag="${prefix}${next_number}"

release_date=$(date +%F)
offset=$((year - 1984))
if [ "$offset" -lt 0 ]; then
  offset=$((offset % 60 + 60))
fi

stem_index=$((offset % 10))
animal_index=$((offset % 12))

case "$stem_index" in
  0) stem_name="Yang Wood" ;;
  1) stem_name="Yin Wood" ;;
  2) stem_name="Yang Fire" ;;
  3) stem_name="Yin Fire" ;;
  4) stem_name="Yang Earth" ;;
  5) stem_name="Yin Earth" ;;
  6) stem_name="Yang Metal" ;;
  7) stem_name="Yin Metal" ;;
  8) stem_name="Yang Water" ;;
  9) stem_name="Yin Water" ;;
  *) stem_name="Unknown" ;;
esac

case "$animal_index" in
  0) animal_name="Rat"; animal_emoji="🐀" ;;
  1) animal_name="Ox"; animal_emoji="🐂" ;;
  2) animal_name="Tiger"; animal_emoji="🐅" ;;
  3) animal_name="Rabbit"; animal_emoji="🐇" ;;
  4) animal_name="Dragon"; animal_emoji="🐉" ;;
  5) animal_name="Snake"; animal_emoji="🐍" ;;
  6) animal_name="Horse"; animal_emoji="🐎" ;;
  7) animal_name="Goat"; animal_emoji="🐐" ;;
  8) animal_name="Monkey"; animal_emoji="🐒" ;;
  9) animal_name="Rooster"; animal_emoji="🐓" ;;
  10) animal_name="Dog"; animal_emoji="🐕" ;;
  11) animal_name="Pig"; animal_emoji="🐖" ;;
  *) animal_name="Unknown"; animal_emoji="🐾" ;;
esac

chinese_name="${stem_name} ${animal_name}"

month=$(date +%m)
day=$(date +%d)
month=$((10#$month))
day=$((10#$day))

zodiac_name="Capricorn"
zodiac_emoji="♑"

case "$month" in
  1)
    if [ "$day" -ge 20 ]; then
      zodiac_name="Aquarius"; zodiac_emoji="♒"
    else
      zodiac_name="Capricorn"; zodiac_emoji="♑"
    fi
    ;;
  2)
    if [ "$day" -ge 19 ]; then
      zodiac_name="Pisces"; zodiac_emoji="♓"
    else
      zodiac_name="Aquarius"; zodiac_emoji="♒"
    fi
    ;;
  3)
    if [ "$day" -ge 21 ]; then
      zodiac_name="Aries"; zodiac_emoji="♈"
    else
      zodiac_name="Pisces"; zodiac_emoji="♓"
    fi
    ;;
  4)
    if [ "$day" -ge 20 ]; then
      zodiac_name="Taurus"; zodiac_emoji="♉"
    else
      zodiac_name="Aries"; zodiac_emoji="♈"
    fi
    ;;
  5)
    if [ "$day" -ge 21 ]; then
      zodiac_name="Gemini"; zodiac_emoji="♊"
    else
      zodiac_name="Taurus"; zodiac_emoji="♉"
    fi
    ;;
  6)
    if [ "$day" -ge 21 ]; then
      zodiac_name="Cancer"; zodiac_emoji="♋"
    else
      zodiac_name="Gemini"; zodiac_emoji="♊"
    fi
    ;;
  7)
    if [ "$day" -ge 23 ]; then
      zodiac_name="Leo"; zodiac_emoji="♌"
    else
      zodiac_name="Cancer"; zodiac_emoji="♋"
    fi
    ;;
  8)
    if [ "$day" -ge 23 ]; then
      zodiac_name="Virgo"; zodiac_emoji="♍"
    else
      zodiac_name="Leo"; zodiac_emoji="♌"
    fi
    ;;
  9)
    if [ "$day" -ge 23 ]; then
      zodiac_name="Libra"; zodiac_emoji="♎"
    else
      zodiac_name="Virgo"; zodiac_emoji="♍"
    fi
    ;;
  10)
    if [ "$day" -ge 23 ]; then
      zodiac_name="Scorpio"; zodiac_emoji="♏"
    else
      zodiac_name="Libra"; zodiac_emoji="♎"
    fi
    ;;
  11)
    if [ "$day" -ge 22 ]; then
      zodiac_name="Sagittarius"; zodiac_emoji="♐"
    else
      zodiac_name="Scorpio"; zodiac_emoji="♏"
    fi
    ;;
  12)
    if [ "$day" -ge 22 ]; then
      zodiac_name="Capricorn"; zodiac_emoji="♑"
    else
      zodiac_name="Sagittarius"; zodiac_emoji="♐"
    fi
    ;;
esac

release_name="${animal_emoji} ${chinese_name} :: ${zodiac_emoji} ${zodiac_name} :: ${release_date}"

git config user.email "bb-8@hks.ar"
git config user.name "bb-8"

git tag -a "${new_tag}" -m "${release_name}"
git push "https://oauth2:${GITLAB_PERSONAL_ACCESS_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git" "${new_tag}"


auth_header="JOB-TOKEN: ${CI_JOB_TOKEN}"
if [ -n "${GITLAB_PERSONAL_ACCESS_TOKEN:-}" ]; then
  auth_header="PRIVATE-TOKEN: ${GITLAB_PERSONAL_ACCESS_TOKEN}"
fi

curl --fail --request POST --header "${auth_header}" \
  --data-urlencode "name=${release_name}" \
  --data-urlencode "tag_name=${new_tag}" \
  --data-urlencode "description=Automated production release for ${release_date}" \
  "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/releases"

cat <<EOF > release.env
NEW_PRODUCTION_TAG=${new_tag}
RELEASE_DATE=${release_date}
EOF
