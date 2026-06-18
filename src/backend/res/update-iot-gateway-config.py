#!/usr/bin/env python3
import sys

TARGET_FILE = "/mnt/cosmos/boot/etc/iot-gateway/application-prod.yaml"

NEW_PUBLIC_KEY = """-----BEGIN PGP PUBLIC KEY BLOCK-----

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
PKskciGY7m75gPfya6yvLdt+BTL8jMo=
=cm/3
-----END PGP PUBLIC KEY BLOCK-----"""


def update_public_key(file_path, new_key):
    with open(file_path, "r") as f:
        lines = f.readlines()

    new_lines = []
    i = 0
    in_megacosmos = False
    replaced = False

    while i < len(lines):
        line = lines[i]

        if "megacosmosMirrorMockCredentials:" in line:
            in_megacosmos = True
            new_lines.append(line)
            i += 1
            continue

        if in_megacosmos:
            stripped = line.lstrip()
            if line.startswith("    ") and not line.startswith("      ") and stripped and not stripped.startswith("megacosmosMirrorMockCredentials:"):
                in_megacosmos = False
                new_lines.append(line)
                i += 1
                continue

            if stripped.startswith("- key: public_key"):
                new_lines.append(line)
                i += 1
                if i < len(lines) and "value: |" in lines[i]:
                    new_lines.append(lines[i])
                    i += 1
                    while i < len(lines) and "residencyCodeExpression:" not in lines[i]:
                        i += 1
                    for key_line in new_key.strip().split("\n"):
                        new_lines.append(" " * 10 + key_line + "\n")
                    if i < len(lines):
                        new_lines.append(lines[i])
                        i += 1
                    replaced = True
                continue

        new_lines.append(line)
        i += 1

    if not replaced:
        print("ERROR: Could not find megacosmosMirrorMockCredentials.public_key to replace", file=sys.stderr)
        sys.exit(1)

    with open(file_path, "w") as f:
        f.writelines(new_lines)

    print("Successfully updated public_key in {}".format(file_path))


if __name__ == "__main__":
    update_public_key(TARGET_FILE, NEW_PUBLIC_KEY)
