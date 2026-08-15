# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "boto3>=1.34",
# ]
# ///
"""Download every object from an S3-compatible bucket into a local folder.

Self-contained uv inline script — no project install needed:

    uv run scripts/s3_download.py

Prompts for endpoint, region, keys, bucket and destination, then mirrors all
objects to <folder>/<object-key> preserving the key hierarchy. Prints size +
SHA-256 per object so you can verify a complete download.

Works with any path-style S3 endpoint (e.g. Garage, MinIO) including
self-signed TLS.
"""

from __future__ import annotations

import hashlib
import os
import sys

import boto3
from botocore.config import Config

DEFAULT_ENDPOINT = "https://127.0.0.1:8443"
DEFAULT_REGION = "garage"
DEFAULT_FOLDER = "./s3-download"


def prompt(label: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"{label}{suffix}: ").strip()
    return value or default


def main() -> int:
    print("S3 bucket download")
    print("-" * 40)
    endpoint = prompt("Endpoint", DEFAULT_ENDPOINT)
    region = prompt("Region", DEFAULT_REGION)
    access_key = prompt("Access key")
    if not access_key:
        print("Access key is required", file=sys.stderr)
        return 1
    import getpass

    secret_key = getpass.getpass("Secret key: ")
    if not secret_key:
        print("Secret key is required", file=sys.stderr)
        return 1
    bucket = prompt("Bucket")
    if not bucket:
        print("Bucket is required", file=sys.stderr)
        return 1
    folder = prompt("Local folder", DEFAULT_FOLDER)

    verify_answer = prompt(
        "TLS verify (path to CA cert for self-signed, 'insecure' to skip, blank = system trust)"
    )
    if not verify_answer:
        verify = True
    elif verify_answer.lower() == "insecure":
        verify = False
    else:
        verify = verify_answer

    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        verify=verify,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )

    print(f"\nListing objects in s3://{bucket} ...")
    keys: list[str] = []
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket):
        for obj in page.get("Contents", []):
            keys.append(obj["Key"])
    if not keys:
        print("Bucket empty or not found.")
        return 1
    print(f"Found {len(keys)} object(s)\n")

    mismatches = 0
    for i, key in enumerate(keys, 1):
        dest = os.path.join(folder, key)
        os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
        try:
            client.download_file(bucket, key, dest)
        except Exception as exc:  # noqa: BLE001
            print(f"  FAIL {key}: {exc}")
            mismatches += 1
            continue
        sha = hashlib.sha256(open(dest, "rb").read()).hexdigest()
        size = os.path.getsize(dest)
        print(f"  OK   {key}  ({size} bytes)  sha256={sha[:16]}...  [{i}/{len(keys)}]")

    print(f"\nDownloaded to {os.path.abspath(folder)}")
    print(f"Mismatches/failures: {mismatches}")
    return 1 if mismatches else 0


if __name__ == "__main__":
    sys.exit(main())
