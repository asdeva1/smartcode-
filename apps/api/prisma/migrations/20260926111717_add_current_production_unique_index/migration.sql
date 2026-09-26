-- SmartCode: only one current ProductionEntry version per Chart
CREATE UNIQUE INDEX "ProductionEntry_chartId_current_unique"
  ON "ProductionEntry" ("chartId")
  WHERE "isCurrent" = true;
