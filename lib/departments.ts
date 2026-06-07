export type Department = {
  id: string;
  label: string;
  description: string;
  engineId: string;
};

export type PublicDepartment = Pick<Department, "id" | "label" | "description">;

function isDepartment(value: unknown): value is Department {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    record.id.length > 0 &&
    typeof record.label === "string" &&
    record.label.length > 0 &&
    typeof record.description === "string" &&
    typeof record.engineId === "string" &&
    record.engineId.length > 0
  );
}

let cachedDepartments: Department[] | null = null;

export function getDepartments(): Department[] {
  if (cachedDepartments) {
    return cachedDepartments;
  }

  const raw = process.env.DEPARTMENTS_CONFIG;
  if (!raw) {
    throw new Error("Missing required environment variable: DEPARTMENTS_CONFIG");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("DEPARTMENTS_CONFIG must be valid JSON");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("DEPARTMENTS_CONFIG must be a non-empty array");
  }

  if (!parsed.every(isDepartment)) {
    throw new Error(
      "DEPARTMENTS_CONFIG entries must include id, label, description, and engineId",
    );
  }

  const ids = new Set<string>();
  for (const department of parsed) {
    if (ids.has(department.id)) {
      throw new Error(`Duplicate department id in DEPARTMENTS_CONFIG: ${department.id}`);
    }
    ids.add(department.id);
  }

  cachedDepartments = parsed;
  return cachedDepartments;
}

export function getDepartmentById(id: string): Department | undefined {
  return getDepartments().find((department) => department.id === id);
}

export function getPublicDepartments(): PublicDepartment[] {
  return getDepartments().map(({ id, label, description }) => ({
    id,
    label,
    description,
  }));
}
