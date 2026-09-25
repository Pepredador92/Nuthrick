-- Complete the last review marker while keeping Terms v1 pending human approval.
update private.legal_documents
set body = replace(
      body,
      '[PENDIENTE: CONFIRMAR LEY APLICABLE Y JURISDICCIÓN COMPETENTE]',
      '## Ley aplicable y jurisdicción\nEstos términos se interpretan conforme a las leyes aplicables de México. Para cualquier controversia, serán competentes los tribunales que correspondan en el Estado de Zacatecas, sin perjuicio de los derechos irrenunciables o fueros que la ley reconozca a la persona usuaria.'
    ),
    review_status = 'pending_review',
    effective_at = null,
    published_at = null,
    approved_at = null,
    approved_by = null,
    updated_at = now()
where "key" = 'terms'
  and version = 1
  and review_status = 'pending_review';
