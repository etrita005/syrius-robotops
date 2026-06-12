#!/bin/bash
set +e

function check_and_print_file() {
  local file_path="$1"

  if [ -e "$file_path" ]; then
    echo "$file_path: $(cat "$file_path")"
  else
    echo "$file_path not exits"
  fi
}

function show_robot_info() {
  echo ''
  check_and_print_file /sys/robotInfo/BoardID
  check_and_print_file /sys/robotInfo/BoardSN
  check_and_print_file /sys/robotInfo/CortexSN
  check_and_print_file /sys/robotInfo/RobotSN
  check_and_print_file /sys/robotInfo/Model
  check_and_print_file /sys/robotInfo/VendorID
  check_and_print_file /sys/robotInfo/ProductID
  echo ''
}

# get dir name of target robot model
function get_bup_package_prefix() {
  local release_file="/etc/jurassic_release"
  local hwver_file="/sys/jcbver/hwver"

  if [ ! -e "$release_file" ]; then
    echo "$release_file not exits! exit.."
    exit 1
  fi

  local name hwver
  name=$(cut -d'-' -f1 "$release_file")

  # vulture has different hw version
  if [ "$name" = "vulture" ] && [ -e "$hwver_file" ]; then
    hwver=$(tr 'A-Z' 'a-z' < "$hwver_file")

    # special case: v16 / v07 -> v06
    case "$hwver" in
      v16|v07|v06)
        hwver="v06"
        ;;
    esac

    echo "${name}_${hwver}"
  else
    echo "$name"
  fi
}

function upgrade_bup() {
  local bup_package_prefix=$(get_bup_package_prefix)
  echo "$bup_package_prefix"
  local cache_path="$1"

  # 1. current version should >= 1.1.870.
  # cur_version=$(cat /etc/jurassic_release | cut -d'-' -f2)
  # cur_version=$(cut -d'-' -f2 /etc/jurassic_release | sed 's/^v//')
  if [ -e /etc/jurassic_release ]; then
    cur_version=$(cut -d'-' -f2 /etc/jurassic_release | sed 's/^v//')
  elif [ -e /etc/l4t_jurassic_release ]; then
    cur_version=$(cut -d'-' -f2 /etc/l4t_jurassic_release | sed 's/^v//')
  else
    echo "can not find /etc/jurassic_release or /etc/l4t_jurassic_release"
    exit 1
  fi
  echo "current L4T version: $cur_version"
  # echo "hardware version: "$(cat /sys/jcbver/hwver)
  [ -e /sys/jcbver/hwver ] && echo "hardware version: $(cat /sys/jcbver/hwver)" || echo "hardware version: unknown"
  if dpkg --compare-versions "$cur_version" ge "1.1.870"; then
    echo "current L4T version >= 1.1.870, continue"
  else
    echo "current L4T version < 1.1.870, please flash L4T"
    exit 1
  fi

  # 2. check robot information.
  show_robot_info
  
  # 3. install bup package
  # 3.1 find deb(e.g: vulture_v06_update_tools_1.1.925_arm64.deb)
  deb_name="$bup_package_prefix"_*_arm64.deb
  deb_file=$(find "$cache_path" -name "$deb_name" | sort | tail -n1)
  if [ -z "$deb_file" ]; then
    echo "=== no bup package found, please check: $cache_path"
    exit 1
  fi

  # 3.2 [target version] vs [current version]
  target_version=$(echo "$deb_file" | grep -oP '\d+\.\d+\.\d+')
  # gt > ; ge >=
  # if dpkg --compare-versions "$cur_version" ge "$target_version"; then
  if dpkg --compare-versions "$cur_version" gt "$target_version"; then
    echo "current L4T version >= target version $target_version, no need to upgrade, abort"
    exit 1
  fi

  date
  # 3.3 install deb
  echo "=== installing bup package: $deb_file"
  sudo dpkg -i --force-overwrite "$deb_file"

  echo "=== execute upgrade script, record log to /mnt/cosmos/log/l4t_upgrade.log ..."
  # 3.4 record version and 
  version=$(echo "$deb_file" | grep -oP '\d+\.\d+\.\d+')
  echo $version > /mnt/cosmos/log/l4t_version.txt
  sudo /usr/local/sbin/jurassic_ota_start.sh > /mnt/cosmos/log/l4t_upgrade.log 2>&1 &
  date
}

# usage: upgrade_bup.sh <download_path>
# example: ./upgrade_bup.sh /home/developer/ota
upgrade_bup $1