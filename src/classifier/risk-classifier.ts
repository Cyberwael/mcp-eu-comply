import { RiskLevel, RiskRule } from '../types.js';

/**
 * Priority map for risk levels. Higher number = higher risk.
 */
const RISK_PRIORITY: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Checks whether a tool name matches a rule's toolPattern.
 *
 * @param toolName - Name of the MCP tool being called.
 * @param pattern - String (exact or substring) or RegExp to match against.
 * @returns True if the pattern matches the tool name.
 */
function matchesToolPattern(toolName: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return toolName === pattern || toolName.includes(pattern);
  }
  return pattern.test(toolName);
}

/**
 * Checks whether tool arguments satisfy a rule's argsPattern.
 * Each key in argsPattern must be present in args and its string value must match the pattern.
 *
 * @param args - Tool arguments as key-value pairs.
 * @param argsPattern - Patterns to match against specific argument values.
 * @returns True if all arg patterns match.
 */
function matchesArgsPattern(
  args: Record<string, unknown>,
  argsPattern: Record<string, RegExp | string>
): boolean {
  for (const [key, pattern] of Object.entries(argsPattern)) {
    const argValue = args[key];
    if (argValue === undefined || argValue === null) {
      return false;
    }
    const argStr = String(argValue);
    if (typeof pattern === 'string') {
      if (argStr !== pattern) {
        return false;
      }
    } else {
      if (!pattern.test(argStr)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Classifies a tool call's risk level by matching against configured rules.
 * Returns the HIGHEST matching risk level. Default: 'medium' when no rule matches.
 *
 * @param toolName - Name of the MCP tool being called.
 * @param args - Tool arguments (may be used for finer-grained classification).
 * @param rules - Array of risk rules to match against.
 * @returns The highest matching risk level, or 'medium' if no rule matches.
 */
export function classifyRisk(
  toolName: string,
  args: Record<string, unknown>,
  rules: RiskRule[]
): RiskLevel {
  if (rules.length === 0) {
    return 'medium';
  }

  const matchedLevels: RiskLevel[] = [];

  for (const rule of rules) {
    if (!matchesToolPattern(toolName, rule.toolPattern)) {
      continue;
    }

    if (rule.argsPattern) {
      if (!matchesArgsPattern(args, rule.argsPattern)) {
        continue;
      }
    }

    matchedLevels.push(rule.level);
  }

  if (matchedLevels.length === 0) {
    return 'medium';
  }

  let highest: RiskLevel = matchedLevels[0]!;
  for (let i = 1; i < matchedLevels.length; i++) {
    const level = matchedLevels[i]!;
    if (RISK_PRIORITY[level] > RISK_PRIORITY[highest]) {
      highest = level;
    }
  }

  return highest;
}
