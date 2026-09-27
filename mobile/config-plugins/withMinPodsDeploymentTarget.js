// config-plugins/withMinPodsDeploymentTarget.js
//
// Raises every Pods target whose IPHONEOS_DEPLOYMENT_TARGET is below 15.1 up to
// 15.1, from the Podfile's post_install hook. Targets already at 15.1+ (e.g. the
// 16.4 Expo default) are left untouched.
//
// WHY THIS EXISTS:
//   Xcode 27 only accepts iOS deployment targets 15.0+. Several pods pin their
//   own older target in their podspec (Stripe resource bundles 13.0, RNSVG 12.4,
//   RNCAsyncStorage 13.4, ReachabilitySwift 12.0…), so the iOS build fails with
//   "IPHONEOS_DEPLOYMENT_TARGET is set to 13.0, but the range of supported
//   deployment target versions is 15.0 to 27.0.x".
//   expo-build-properties' `ios.deploymentTarget` only sets the app/Podfile
//   platform, not each pod's own setting, so it can't fix this.
//
// HOW IT WORKS:
//   `withDangerousMod` edits ios/Podfile after prebuild generates it, inserting a
//   marked Ruby block as the last step of `post_install` (after
//   react_native_post_install). The marker makes re-runs idempotent, and EAS runs
//   prebuild on the server, so the fix survives regenerated native projects.

const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const MIN_TARGET = '15.1';
const MARKER = '# @generated withMinPodsDeploymentTarget';

const RUBY_BLOCK = `    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        next if current.nil? || current.to_s.empty?
        if Gem::Version.new(current.to_s) < Gem::Version.new('${MIN_TARGET}')
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_TARGET}'
        end
      end
    end
`;

function addMinTargetToPodfile(contents) {
  if (contents.includes(MARKER)) return contents;

  const lines = contents.split('\n');
  const start = lines.findIndex((l) => /^\s*post_install do \|installer\|/.test(l));
  if (start === -1) {
    throw new Error('[withMinPodsDeploymentTarget] post_install block not found in Podfile');
  }
  const indent = lines[start].match(/^\s*/)[0];
  // The block's closing `end` is the first later line at the same indentation.
  const end = lines.findIndex((l, i) => i > start && l === `${indent}end`);
  if (end === -1) {
    throw new Error('[withMinPodsDeploymentTarget] end of post_install block not found in Podfile');
  }
  lines.splice(end, 0, RUBY_BLOCK.trimEnd());
  return lines.join('\n');
}

/** @param {import('@expo/config-plugins').ExpoConfig} config */
module.exports = (config) =>
  withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfilePath, 'utf8');
      fs.writeFileSync(podfilePath, addMinTargetToPodfile(contents));
      return modConfig;
    },
  ]);
