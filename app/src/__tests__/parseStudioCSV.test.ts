import { describe, it, expect } from "vitest";
import { parseStudioCSV } from "../lib/parseStudioCSV";

const KNOWN = new Set(["studio-1", "studio-2", "studio-3", "studio-4"]);

describe("parseStudioCSV", () => {
  it("parses a single data row with no header", () => {
    const rows = parseStudioCSV("Studio 101,studio-1,,75", KNOWN);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      studioName:    "Studio 101",
      unitIds:       ["studio-1"],
      assigneeEmail: "",
      monthlyRate:   "75",
      errors:        [],
      warnings:      [],
    });
  });

  it("skips a header line", () => {
    const csv = "studio_name,unit_ids,assignee_email,monthly_rate\nStudio 101,studio-1,,75";
    const rows = parseStudioCSV(csv, KNOWN);
    expect(rows).toHaveLength(1);
    expect(rows[0].studioName).toBe("Studio 101");
  });

  it("does NOT skip a data-looking first line that contains studio-N", () => {
    // First line looks like data (has studio-1), not a header
    const csv = "Studio 101,studio-1,,75\nStudio 102,studio-2,,75";
    const rows = parseStudioCSV(csv, KNOWN);
    expect(rows).toHaveLength(2);
  });

  it("handles multi-unit quoted field", () => {
    const rows = parseStudioCSV(`Studio 102,"studio-2,studio-3",,75`, KNOWN);
    expect(rows[0].unitIds).toEqual(["studio-2", "studio-3"]);
    expect(rows[0].errors).toHaveLength(0);
  });

  it("handles space-separated unit IDs", () => {
    const rows = parseStudioCSV("Studio 103,studio-1 studio-2,,75", KNOWN);
    expect(rows[0].unitIds).toEqual(["studio-1", "studio-2"]);
  });

  it("errors when studio name is missing", () => {
    const rows = parseStudioCSV(",studio-1,,75", KNOWN);
    expect(rows[0].errors).toContain("Missing studio name");
  });

  it("errors when unit IDs are missing", () => {
    const rows = parseStudioCSV("Studio 101,,,75", KNOWN);
    expect(rows[0].errors).toContain("No unit IDs");
  });

  it("warns when a unit is not in knownUnits", () => {
    const rows = parseStudioCSV("Studio 101,studio-99,,75", KNOWN);
    expect(rows[0].warnings.some(w => w.includes("studio-99"))).toBe(true);
  });

  it("warns when assignee email looks invalid", () => {
    const rows = parseStudioCSV("Studio 101,studio-1,notanemail,75", KNOWN);
    expect(rows[0].warnings.some(w => w.includes("notanemail"))).toBe(true);
  });

  it("no warning for valid email", () => {
    const rows = parseStudioCSV("Studio 101,studio-1,member@example.com,75", KNOWN);
    expect(rows[0].warnings.filter(w => w.includes("email"))).toHaveLength(0);
  });

  it("warns when monthly rate is not a number", () => {
    const rows = parseStudioCSV("Studio 101,studio-1,,banana", KNOWN);
    expect(rows[0].warnings.some(w => w.includes("banana"))).toBe(true);
  });

  it("ignores blank lines and comment lines", () => {
    const csv = `# this is a comment
Studio 101,studio-1,,75

Studio 102,studio-2,,75`;
    const rows = parseStudioCSV(csv, KNOWN);
    expect(rows).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(parseStudioCSV("", KNOWN)).toHaveLength(0);
    expect(parseStudioCSV("   ", KNOWN)).toHaveLength(0);
    expect(parseStudioCSV("# just a comment", KNOWN)).toHaveLength(0);
  });

  it("parses optional fields as empty strings when absent", () => {
    const rows = parseStudioCSV("Studio 101,studio-1", KNOWN);
    expect(rows[0].assigneeEmail).toBe("");
    expect(rows[0].monthlyRate).toBe("");
  });
});
