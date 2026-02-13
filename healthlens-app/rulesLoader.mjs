import rulesConfig from './config/rules.json' with { type: 'json' };

const profiles = Array.isArray(rulesConfig?.profiles) ? rulesConfig.profiles : [];
const profileMap = new Map(profiles.map((profile) => [profile.profile_id, profile]));

function validateRulesConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid rules configuration: root object missing.');
  }

  if (!config.rules_version) {
    throw new Error('Invalid rules configuration: rules_version is required.');
  }

  if (!config.default_profile_id) {
    throw new Error('Invalid rules configuration: default_profile_id is required.');
  }

  if (!profileMap.has(config.default_profile_id)) {
    throw new Error(`Invalid rules configuration: default profile ${config.default_profile_id} not found.`);
  }
}

validateRulesConfig(rulesConfig);

export function getRulesConfig() {
  return rulesConfig;
}

export function getRulesVersion() {
  return String(rulesConfig.rules_version || '0.0.0');
}

export function isGlobalGuardrailEnabled() {
  return Boolean(rulesConfig?.runtime_flags?.GLOBAL_GUARDRAIL_V1);
}

export function getDefaultProfileId() {
  return String(rulesConfig.default_profile_id);
}

export function getProfile(profileId) {
  if (!profileId) return null;
  return profileMap.get(String(profileId)) || null;
}

export function getDefaultProfile() {
  return getProfile(getDefaultProfileId());
}

export function getGlobalFrameworkProfiles() {
  const defaultProfile = getDefaultProfile();
  if (!defaultProfile) return [];

  const frameworkIds = Array.isArray(rulesConfig?.global_profile?.framework_ids)
    ? rulesConfig.global_profile.framework_ids
    : [];

  return frameworkIds.map((id) => getProfile(id)).filter(Boolean);
}
