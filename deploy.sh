#!/usr/bin/env bash
# Roll the cluster forward to a build that CI has already published.
#
#   ./deploy.sh              the build of the commit you are on (build-<commit count>, as CI tags it)
#   ./deploy.sh build-90     any tag in the registry, which is also how to go back to an older one
#   ./deploy.sh build-93 --dry-run=server     anything after the tag is handed to helm
#
# Only the image tag changes. The registry, the hostname and the issuer are the ones the release
# was installed with, so none of them has to be written down here.
set -euo pipefail

release=last-return
namespace=last-return
context=cluster-k8xq1

cd "$(dirname "$0")"

tag=${1:-build-$(git rev-list --count HEAD)}
shift || true

# The image the cluster is running now is where the registry is read from.
if ! current=$(kubectl --context "$context" -n "$namespace" get deployment "$release" \
    -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null); then
  echo "There is no '$release' release in namespace '$namespace' on context '$context' to update (or the cluster cannot be reached)." >&2
  echo "The first install names the registry and the hostname; this script only moves the tag after that." >&2
  exit 1
fi
repository=${current%:*}

if [ "$current" = "$repository:$tag" ]; then
  echo "Already running $tag."
  exit 0
fi

# A tag that is not in the registry would leave the new pod stuck pulling, so ask first.
if ! docker manifest inspect "$repository:$tag" >/dev/null 2>&1; then
  echo "$tag is not in the registry." >&2
  echo "CI only tags builds of main, and only once the push has finished: gh run list --workflow docker.yml --limit 3" >&2
  exit 1
fi

echo "${current##*:} -> $tag"

# reset-then-reuse-values: the chart's current defaults, then what the install was given, then the tag.
# rollback-on-failure: if the new pods never become ready, the release goes back to what it was.
helm upgrade "$release" ./chart --kube-context "$context" --namespace "$namespace" \
  --reset-then-reuse-values --set image.tag="$tag" \
  --rollback-on-failure --wait --timeout 3m "$@"

host=$(kubectl --context "$context" -n "$namespace" get ingress "$release" -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || true)
if [ -n "$host" ]; then
  echo "Live at https://$host"
fi
