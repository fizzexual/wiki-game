import { AnimatePresence, motion } from "framer-motion";
import { fmtTime } from "../lib/format";
import { PathDisplay } from "./PathDisplay";

interface Props {
  open: boolean;
  won: boolean;
  start: string;
  end: string;
  clicks: number;
  elapsedSec: number;
  yourPath: string[];
  optimalPath: string[] | null;
  optimalStatus: string;
  challengeName?: string;
  stagesDone?: number;
  stagesTotal?: number;
  onBackToMenu: () => void;
}

export function EndScreen({
  open, won, start, end, clicks, elapsedSec,
  yourPath, optimalPath, optimalStatus,
  challengeName, stagesDone, stagesTotal,
  onBackToMenu,
}: Props) {
  const headline = won
    ? challengeName
      ? `${challengeName} cleared in ${clicks} click${clicks === 1 ? "" : "s"}.`
      : `Solved in ${clicks} click${clicks === 1 ? "" : "s"}.`
    : challengeName && stagesDone != null && stagesTotal != null
      ? `Gave up after ${stagesDone}/${stagesTotal} stage${stagesTotal === 1 ? "" : "s"}.`
      : "Gave up.";

  const sub = won
    ? `Time: ${fmtTime(elapsedSec)} · ${start} → ${end}`
    : challengeName
      ? `Time: ${fmtTime(elapsedSec)} · ${clicks} click${clicks === 1 ? "" : "s"} traveled`
      : `You traveled ${clicks} hop${clicks === 1 ? "" : "s"} without reaching ${end}.`;

  const optHops = optimalPath ? optimalPath.length - 1 : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal modal-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <motion.div className="modal-backdrop end-backdrop" />
          <motion.div
            className="modal-card end-card-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-title"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.25 }}
            >
              <h2 id="end-title" className="end-headline">{headline}</h2>
              <p className="muted end-sub">{sub}</p>
            </motion.div>

            <div className="paths">
              <motion.div
                className="path-col"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12, duration: 0.3 }}
              >
                <h3>Your path <span className="badge">{clicks} hop{clicks === 1 ? "" : "s"}</span></h3>
                <PathDisplay titles={yourPath.length ? yourPath : [start]} />
              </motion.div>
              <motion.div
                className="path-col"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.18, duration: 0.3 }}
              >
                <h3>
                  Optimal path{" "}
                  <span className="badge accent">
                    {optHops != null ? `${optHops} hop${optHops === 1 ? "" : "s"}` : "…"}
                  </span>
                </h3>
                {optimalPath ? (
                  <PathDisplay titles={optimalPath} />
                ) : (
                  <div className="muted small optimal-status">{optimalStatus}</div>
                )}
              </motion.div>
            </div>

            <motion.div
              className="modal-actions end-actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.25 }}
            >
              <motion.button
                type="button"
                className="primary"
                onClick={onBackToMenu}
                whileTap={{ scale: 0.97 }}
              >
                Back to menu
              </motion.button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
