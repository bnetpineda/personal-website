interface DecorativeBackgroundProps {
  position?: "top" | "bottom" | "both";
}

export function DecorativeBackground({ position = "both" }: DecorativeBackgroundProps) {
  return (
    <>
      {(position === "top" || position === "both") && (
        <>
          <div className="absolute top-16 left-8 w-14 h-14 bg-main/20 border-4 border-border rotate-12 hidden md:block" />
          <div className="absolute top-16 right-12 w-14 h-14 bg-main/20 border-4 border-border rotate-12 hidden md:block" />
          <div className="absolute top-10 left-10 w-20 h-20 bg-main/20 border-4 border-border rotate-12 hidden md:block" />
          <div className="absolute top-20 right-10 w-16 h-16 bg-main/20 border-4 border-border -rotate-12 hidden md:block" />
        </>
      )}
      {(position === "bottom" || position === "both") && (
        <>
          <div className="absolute bottom-16 left-12 w-10 h-10 bg-main/30 border-4 border-border -rotate-6 hidden md:block" />
          <div className="absolute bottom-16 right-8 w-10 h-10 bg-main/30 border-4 border-border -rotate-6 hidden md:block" />
          <div className="absolute bottom-20 left-10 w-12 h-12 bg-main/30 border-4 border-border rotate-6 hidden md:block" />
          <div className="absolute bottom-10 right-10 w-16 h-16 bg-main/30 border-4 border-border -rotate-6 hidden md:block" />
          <div className="absolute top-1/2 left-8 w-8 h-8 bg-main border-4 border-border rotate-45 hidden lg:block" />
          <div className="absolute top-1/2 right-20 w-8 h-8 bg-main border-4 border-border rotate-45 hidden lg:block" />
        </>
      )}
    </>
  );
}
