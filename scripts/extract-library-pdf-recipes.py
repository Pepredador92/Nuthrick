"""Read-only PDF extraction. Emits only meal paragraphs, never headers/clinical pages.
Usage: bundled-python scripts/extract-library-pdf-recipes.py /private/source/directory
Review stdout before adding the anonymized result to the repository.
"""
import json
import re
import sys
from pathlib import Path
from pypdf import PdfReader

records = []
for index, path in enumerate(sorted(Path(sys.argv[1]).glob('*PLAN_ALIMENTACION_*.pdf')), 1):
    for page_number, page in enumerate(PdfReader(path).pages, 1):
        text = re.sub(r'\s+', ' ', page.extract_text()).strip()
        stage = re.search(r'Dieta (\d+)\s*[—–-]', text)
        if not stage:
            continue
        matches = re.findall(r'(Desayuno|Comida|Cena)\s*[—–-]\s*(.*?)\s+Ingredientes:\s*(.*?)\s+Preparación:\s*(.*?)\s+Sustitución:', text)
        if len(matches) != 3:
            raise ValueError(f'Unexpected meal layout in source {index}, page {page_number}')
        goal = re.search(r'Meta aproximada:\s*(.*?)(?:\.|\s+Desayuno)', text)
        meals = []
        for time, name, ingredients, preparation in matches:
            # Supplement placement/exercise advice is patient-specific, not recipe method.
            preparation = re.split(r'\s+Si no hay ejercicio,', preparation)[0]
            meals.append(dict(time=time, name=name, ingredients=ingredients, preparation=preparation))
        records.append(dict(code=f'PDF{index:02d}-D{stage[1]}', page=page_number,
                            declared_energy=goal[1].split(', con')[0] if goal else None, meals=meals))
print(json.dumps(records, ensure_ascii=False, indent=2))
