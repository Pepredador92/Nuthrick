export const individualPlans = [
  {
    code: "essential",
    name: "Nuthrick Essential",
    monthlyPriceMxn: 399,
    tone: "border-[#dce5df] bg-white",
    note: "Una base profesional para tu consulta.",
    value: false,
  },
  {
    code: "pro",
    name: "Nuthrick Pro",
    monthlyPriceMxn: 649,
    tone: "border-[#c6d9ce] bg-[#f9fcf9]",
    note: "Más continuidad para tu proceso de atención.",
    value: false,
  },
  {
    code: "complete",
    name: "Nuthrick Complete",
    monthlyPriceMxn: 799,
    tone: "border-[#173d36] bg-[#173d36] text-white shadow-[0_24px_60px_rgba(23,61,54,.18)]",
    note: "La experiencia Nuthrick más completa.",
    value: true,
  },
] as const;
