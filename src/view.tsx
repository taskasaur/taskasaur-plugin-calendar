"use client";
import { useEffect, useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Play,
  Square,
  Download,
  Upload,
  Check,
  AlarmClock,
} from "lucide-react";
import type { AppRuntime } from "@taskasaur/plugin-host";
import { RecordTable } from "@taskasaur/ui/record-table";
import { Button } from "@taskasaur/ui/primitives/button";
import { Input } from "@taskasaur/ui/primitives/input";
import {
  calendarExport,
  calendarImport,
  importedReminders,
} from "@taskasaur/platform/core/calendar";
import { calendarOccurrences } from "@taskasaur/platform/core/calendar-values";
import { field } from "@taskasaur/platform/field-types";
import { FieldInput } from "@taskasaur/ui/fields";
import type { ResourceRecord } from "@taskasaur/platform/plugin-sdk";
export function CalendarView({ runtime }: { runtime: AppRuntime }) {
  const [error, setError] = useState(""),
    [view, setView] = useState("table"),
    [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const projection = useMemo(
    () => ({
      id: "agenda",
      pluginId: "calendar",
      name: "Agenda",
      version: 1,
      fields: [
        field("summary", "Title"),
        field("start", "Start", "timestamp with time zone"),
        field("end", "End", "timestamp with time zone"),
        field("all_day", "All day", "boolean"),
        field("location", "Location"),
      ],
    }),
    [],
  );
  const projectedStore = useMemo(
    () => ({
      list: async () => {
        const rows = await runtime.collection("calendar").list(),
          from = Date.parse(date + "T00:00:00Z"),
          to = from + 31 * 86400000;
        try {
          return calendarOccurrences(
            rows.map((r) => r.data),
            from,
            to,
            Intl.DateTimeFormat().resolvedOptions().timeZone,
          ).map((occurrence) => ({
            ...rows.find((r) => r.data.uid === occurrence.data.uid)!,
            id: occurrence.key,
            data: {
              summary: occurrence.data.summary,
              start: occurrence.start,
              end: occurrence.end,
              all_day: occurrence.allDay,
              location: occurrence.data.location,
            },
          }));
        } catch (error) {
          setError(error instanceof Error ? error.message : String(error));
          return [];
        }
      },
      put: async () => {
        throw new Error("Edit the event in the table");
      },
      delete: async () => {
        throw new Error("Edit the event in the table");
      },
    }),
    [runtime, date],
  );
  const exportEvents = async () => {
    const rows = await runtime.collection("calendar").list();
    download(
      "calendar.ics",
      new Blob([calendarExport(rows.map((r) => r.data))], {
        type: "text/calendar",
      }),
    );
  };
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        <Button
          variant={view === "table" ? "secondary" : "ghost"}
          onClick={() => setView("table")}
        >
          Events table
        </Button>
        <Button
          variant={view === "agenda" ? "secondary" : "ghost"}
          onClick={() => setView("agenda")}
        >
          Agenda
        </Button>
        {view === "agenda" && (
          <FieldInput
            definition={field("agenda_date", "Agenda from", "date")}
            value={date}
            onChange={(value) => setDate(String(value))}
          />
        )}
      </div>
      {view === "agenda" ? (
        <RecordTable
          runtime={runtime}
          collection="calendar"
          viewKey="calendar.agenda"
          schemaOverride={projection}
          storeOverride={projectedStore}
          readOnly
        />
      ) : (
        <RecordTable
          runtime={runtime}
          collection="calendar"
          toolbar={
            <>
              <Button variant="outline" onClick={() => void exportEvents()}>
                <Download size={14} />
                Export
              </Button>
              <label className="upload-button">
                <Upload size={14} />
                Import
                <input
                  type="file"
                  accept=".ics,text/calendar"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const existing = await runtime
                        .collection("calendar")
                        .list();
                      for (const data of calendarImport(await file.text())) {
                        const old = existing.find(
                          (r) =>
                            r.data.uid === data.uid &&
                            r.data.recurrence_id === data.recurrence_id,
                        );
                        const event = await runtime
                          .collection("calendar")
                          .put(data, old?.id);
                        if (!old && runtime.registry.enabled("reminders"))
                          for (const alarm of importedReminders(data, event.id))
                            await runtime.collection("reminders").put(alarm);
                      }
                      setError("");
                    } catch (error) {
                      setError(
                        error instanceof Error ? error.message : String(error),
                      );
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </>
          }
        />
      )}
      {error && (
        <p role="alert" className="error-banner mt-3">
          {error}
        </p>
      )}
    </>
  );
}
export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
