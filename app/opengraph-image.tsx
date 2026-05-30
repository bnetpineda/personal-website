import { ImageResponse } from "next/og";

export const alt = "Mark Bennett Pineda | Full Stack Developer";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "white",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          border: "20px solid black",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#a3e635", // lime-400 equivalent approx for the main color
            padding: "40px 80px",
            border: "8px solid black",
            boxShadow: "15px 15px 0px 0px black",
            transform: "rotate(-2deg)",
          }}
        >
          <h1
            style={{
              fontSize: 80,
              fontWeight: 900,
              margin: 0,
              color: "black",
              textTransform: "uppercase",
              letterSpacing: "-2px",
            }}
          >
            Mark Pineda
          </h1>
          <div
            style={{
              marginTop: 20,
              fontSize: 32,
              fontWeight: 700,
              color: "black",
              backgroundColor: "white",
              padding: "10px 20px",
              border: "4px solid black",
            }}
          >
            FULL STACK DEVELOPER
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 40,
            display: "flex",
            gap: 20,
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              background: "black",
              borderRadius: "50%",
            }}
          />
          <div
            style={{
              width: 20,
              height: 20,
              background: "black",
              borderRadius: "50%",
            }}
          />
          <div
            style={{
              width: 20,
              height: 20,
              background: "black",
              borderRadius: "50%",
            }}
          />
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
