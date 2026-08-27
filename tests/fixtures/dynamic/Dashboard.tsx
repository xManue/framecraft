interface Props { running: boolean; motors: { id: string }[] }

export function Dashboard({ running, motors }: Props) {
  return (
    <>
      {running ? <strong>Running</strong> : <strong>Stopped</strong>}
      <section>
        {motors.map((motor) => <MotorCard key={motor.id} motor={motor} />)}
      </section>
    </>
  );
}

function MotorCard({ motor }: { motor: { id: string } }) {
  return <article>{motor.id}</article>;
}
