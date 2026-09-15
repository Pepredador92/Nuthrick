import { useEffect, useState } from "react";
import { listFoodItems, listRecipes } from "@/src/services/foodCatalog";
import type { PreparationCatalog } from "@/src/features/diet-workshop/proposals";

export function usePreparationCatalog(supplied?: PreparationCatalog) {
  const [catalog, setCatalog] = useState(supplied);
  const [loading, setLoading] = useState(!supplied);
  const [error, setError] = useState("");
  useEffect(() => {
    if (supplied) return;
    let alive = true;
    void Promise.all([listFoodItems(), listRecipes()]).then(([foods, recipes]) => {
      if (alive) { setCatalog({ foods, recipes }); setLoading(false); }
    }).catch(() => { if (alive) { setError("No se pudo comprobar el catálogo. La propuesta será general; revisa los alimentos en Menú."); setLoading(false); } });
    return () => { alive = false; };
  }, [supplied]);
  return { catalog: supplied ?? catalog, loading, error };
}
