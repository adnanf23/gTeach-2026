export default function Paragraph({
  children,
  align,
  fontSize = "base",
  color = "#c9c9c9",
}) {
  return (
    <>
      <p
        className={`
        text-base text-${align} mt-6 max-w-x text-slate-500 leading-relaxed font-normal
        `}
      >
        {children}
      </p>
    </>
  );
}